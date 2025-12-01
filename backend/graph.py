import os
import re
from datetime import datetime, timezone
from textwrap import wrap

from dotenv import load_dotenv
from neo4j import GraphDatabase

# -----------------------------
# Load environment variables
# -----------------------------
load_dotenv()

NEO4J_URI = os.getenv("NEO4J_URI", "neo4j://127.0.0.1:7687")
NEO4J_USER = os.getenv("NEO4J_USER", "neo4j")
NEO4J_PASSWORD = os.getenv("NEO4J_PASSWORD")

# -----------------------------
# Initialize clients
# -----------------------------
driver = GraphDatabase.driver(NEO4J_URI, auth=(NEO4J_USER, NEO4J_PASSWORD))

# -----------------------------
# Helpers
# -----------------------------

def _safe_db_name(title: str) -> str:
    """
    Converts a string to a CamelCase safe database name:
    - Removes all non-alphanumeric characters
    - Converts words to CamelCase
    - Ensures it starts with a letter
    - Truncates to 60 characters
    """
    # Default title if empty
    title = title or "graph"

    # Split on any non-alphanumeric character
    words = re.split(r'[^a-zA-Z0-9]+', title)

    # Capitalize each word and join
    name = ''.join(word.capitalize() for word in words if word)

    # Ensure it starts with a letter
    if not name or not name[0].isalpha():
        name = f"G{name}" if name else "GDefault"

    # Truncate to reasonable max length
    return name[:60]

def _unique_db_name(base_name: str) -> str:
    """
    Ensure database name is unique by appending a numeric suffix (-2, -3, ...) if needed.
    Checks existing databases via SHOW DATABASES in the system db.
    """
    try:
        with driver.session(database="system") as sys_sess:
            existing = set()
            res = sys_sess.run("SHOW DATABASES YIELD name RETURN name")
            for r in res:
                existing.add(r["name"])
    except Exception:
        # If SHOW DATABASES fails, just return base_name and let creation handle conflicts
        return base_name

    if base_name not in existing:
        return base_name

    # Generate suffixes until an unused name is found; respect 60-char limit
    idx = 2
    while True:
        candidate = f"{base_name}-{idx}"
        candidate = candidate[:60]
        if candidate not in existing:
            return candidate
        idx += 1
# -----------------------------
# Neo4j ingestion
# -----------------------------
def create_entities(tx, entities):
    for e in entities:
        tx.run(
            """
            MERGE (ent:Entity {canonical: $canonical})
            ON CREATE SET ent.type = $type, ent.text = $text
            """,
            canonical=e['canonical'],
            type=e['type'],
            text=e['text']
        )


def create_relations(tx, relations, entities):
    entity_map = {e['id']: e['canonical'] for e in entities}
    for r in relations:
        from_canonical = entity_map.get(r.get('from'))
        to_canonical = entity_map.get(r.get('to'))
        if not from_canonical or not to_canonical:
            continue
        tx.run(
            """
            MATCH (a:Entity {canonical: $from_canonical})
            MATCH (b:Entity {canonical: $to_canonical})
            MERGE (a)-[rel:RELATION {type: $type}]->(b)
            ON CREATE SET rel.confidence = $confidence, rel.evidence = $evidence
            """,
            from_canonical=from_canonical,
            to_canonical=to_canonical,
            type=r.get('type', 'related'),
            confidence=r.get('confidence', 0.0),
            evidence=r.get('evidence_span', '')
        )

def _clear_neo4j_database():
    """
    Remove all nodes and relationships from the target database.
    """
    with driver.session(database="neo4j") as session:
        print(f"[INFO] Clearing database contents for 'neo4j'...")
        session.run("MATCH (n) DETACH DELETE n")
# -----------------------------
# Main pipeline
# -----------------------------
def process_text_to_graph(result: str):
    entities = result.get('entities', [])
    relations = result.get('relations', [])
    title = result.get('title', 'graph')
    print(f"[INFO] Extracted {len(entities)} unique entities and {len(relations)} relations.")

    # Compute a valid base db name and uniquify it if necessary
    base_name = _safe_db_name(title)
    db_name = _unique_db_name(base_name)

    _clear_neo4j_database()

    try:
        with driver.session(database="system") as sys_sess:
            sys_sess.run(f"CREATE DATABASE `{db_name}` IF NOT EXISTS WAIT")
            print(f"[INFO] Database '{db_name}' ensured.")
    except Exception as e:
        print(f"[WARN] Could not ensure database '{db_name}': {e}. Falling back to default database.")
        db_name = None  # use driver default db

    with driver.session(database=db_name) as session:
        session.execute_write(create_entities, entities)
        session.execute_write(create_relations, relations, entities)
        print("[INFO] Entities and relations ingested into Neo4j.")

        print("\n[INFO] Querying Neo4j for verification...\n")
        results = session.run("""
            MATCH (a:Entity)-[r:RELATION]->(b:Entity)
            RETURN a.text AS from_text, r.type AS rel_type, b.text AS to_text, r.confidence AS confidence, r.evidence AS evidence
        """)
        for record in results:
            print(record)
        return db_name or "neo4j"

def retrieve_graph(title: str):
    query = f"""
    MATCH (a:Entity)-[r:RELATION]->(b:Entity)
    RETURN a.canonical AS from, r.type AS type, b.canonical AS to
    """
    with driver.session(database=title) as session:
        results = session.run(query)
        nodes = {}
        edges = []
        id = 0
        for record in results:
            # Add nodes
            for n in [record["from"], record["to"]]:
                if n not in nodes:
                    nodes[n] = {"id": id , "label": n}
                    id += 1
            # Add edge
            edges.append({"source": record["from"], "target": record["to"], "label": record["type"]})
    return {"nodes": list(nodes.values()), "links": edges}

def get_all_databases():
    with driver.session(database="system") as sys_sess:
        results = sys_sess.run("SHOW DATABASES")
        names = [r["name"] for r in results]
        # Return filtered list; don't use list.remove (it returns None)
        return [n for n in names if n != "system" and n != "neo4j"]