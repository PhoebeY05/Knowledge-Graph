import os
import re
import json
from dotenv import load_dotenv
import requests
from datetime import datetime, timezone
from neo4j import GraphDatabase
from textwrap import wrap

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
"entities": [
    {{
    "id": "E1",
    "type": "Organization | Person | Date | Money | Clause | Term",
    "text": "...",
    "canonical": "..."
    }}
],
"relations": [
    {{
    "from": "E1",
    "to": "E2",
    "type": "employs | owes | mentions | amends",
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
        from_canonical = entity_map.get(r['from'])
        to_canonical = entity_map.get(r['to'])
        if not from_canonical or not to_canonical:
            continue  # skip relations if entity missing
        tx.run(
            """
            MATCH (a:Entity {canonical: $from_canonical})
            MATCH (b:Entity {canonical: $to_canonical})
            MERGE (a)-[rel:RELATION {type: $type}]->(b)
            ON CREATE SET rel.confidence = $confidence, rel.evidence = $evidence
            """,
            from_canonical=from_canonical,
            to_canonical=to_canonical,
            type=r['type'],
            confidence=r['confidence'],
            evidence=r['evidence_span']
        )

# -----------------------------
# Main pipeline
# -----------------------------
def process_text_to_graph(text: str):
    print("[INFO] Extracting entities and relations from text...")
    result = extract_entities(text)
    entities = result['entities']
    relations = result['relations']
    print(f"[INFO] Extracted {len(entities)} unique entities and {len(relations)} relations.")

    with driver.session() as session:
        session.execute_write(create_entities, entities)
        session.execute_write(create_relations, relations, entities)
        print("[INFO] Entities and relations ingested into Neo4j.")

        # Query and print results
        print("\n[INFO] Querying Neo4j for verification...\n")
        results = session.run("""
            MATCH (a:Entity)-[r:RELATION]->(b:Entity)
            RETURN a.text AS from_text, r.type AS rel_type, b.text AS to_text, r.confidence AS confidence, r.evidence AS evidence
        """)
        for record in results:
            print(record)
