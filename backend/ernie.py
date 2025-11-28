import json
import os
import re
from datetime import datetime, timezone
from textwrap import wrap

import requests
from dotenv import load_dotenv
from neo4j import GraphDatabase

# -----------------------------
# Load environment variables
# -----------------------------
load_dotenv()

API_URL = "https://aistudio.baidu.com/llm/lmapi/v3/chat/completions"
TOKEN = os.getenv("AI_STUDIO_API_KEY")
NEO4J_URI = os.getenv("NEO4J_URI", "neo4j://127.0.0.1:7687")
NEO4J_USER = os.getenv("NEO4J_USER", "neo4j")
NEO4J_PASSWORD = os.getenv("NEO4J_PASSWORD")

# -----------------------------
# Initialize clients
# -----------------------------
driver = GraphDatabase.driver(NEO4J_URI, auth=(NEO4J_USER, NEO4J_PASSWORD))

def _safe_db_name(title: str) -> str:
    # Neo4j db name: simple ascii letters/numbers, dots and dashes only
    name = (title or "graph").lower()
    # replace anything not [a-z0-9.-] with '-'
    name = re.sub(r"(_|-|\s)+", " ", name).title().replace(" ", "")
    # collapse multiple '-' and remove leading/trailing separators
    name = re.sub(r"-+", "-", name).strip("-.")
    # must start with a letter
    if not name or not name[0].isalpha():
        name = f"g-{name}" if name else "g-default"
    # reasonable max length
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

def safe_parse_json(raw_output: str):
    """Extract JSON from ERNIE output safely, returns empty lists if parsing fails"""
    match = re.search(r"\{.*\}", raw_output, re.DOTALL)
    if match:
        try:
            return json.loads(match.group())
        except json.JSONDecodeError:
            return {"entities": [], "relations": []}
    return {"entities": [], "relations": []}

def extract_entities(text: str) -> dict:
    """
    Sends text to ERNIE API via requests, returns entities and relations as dict.
    """
    headers = {
        "Authorization": f"token {TOKEN}",
        "Content-Type": "application/json",
        "x-bce-date": datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%SZ"),
    }

    prompt = f"""
        Extract entities and relations from the following text. Return JSON only in this format:

        {{
        "title": "...",
        "entities": [
            {{
            "id": "E1",
            "type": "Organization | Person | Date | Money | Clause | Term | ...",
            "text": "...",
            "canonical": "..."
            }}
        ],
        "relations": [
            {{
            "from": "E1",
            "to": "E2",
            "type": "employs | owes | mentions | amends | ...",
            "confidence": 0.0,
            "evidence_span": "..."
            }}
        ]
        }}

        Text: "{text}"
        """

    payload = {
        "model": "ernie-3.5-8k",
        "messages": [
            {"role": "system", "content": "You are an ERNIE developer assistant for entity/relation extraction."},
            {"role": "user", "content": prompt}
        ]
    }

    response = requests.post(API_URL, json=payload, headers=headers)

    if response.status_code != 200:
        raise RuntimeError(f"ERNIE API failed: {response.status_code} {response.text}")

    raw_output = response.json().get("choices", [{}])[0].get("message", {}).get("content", "")
    if not raw_output:
        return {"entities": [], "relations": []}

    return safe_parse_json(raw_output)
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

# -----------------------------
# Main pipeline
# -----------------------------
def process_text_to_graph(text: str):
    print("[INFO] Extracting entities and relations from text...")
    result = extract_entities(text)
    entities = result.get('entities', [])
    relations = result.get('relations', [])
    title = result.get('title', 'graph')
    print(f"[INFO] Extracted {len(entities)} unique entities and {len(relations)} relations.")

    # Compute a valid base db name and uniquify it if necessary
    base_name = _safe_db_name(title)
    db_name = _unique_db_name(base_name)

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
