# backend/main.py
from fastapi import FastAPI, UploadFile, File
from fastapi.middleware.cors import CORSMiddleware
import shutil
import os
from dotenv import load_dotenv

from paddle_ocr import ocr_extract_text  # your OCR function
from ernie import process_text_to_graph   # your ERNIE function
from neo4j import GraphDatabase

os.makedirs("uploads", exist_ok=True)

app = FastAPI()

# Allow frontend requests
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # or specify your frontend domain
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

load_dotenv()

NEO4J_URI = os.getenv("NEO4J_URI", "neo4j://127.0.0.1:7687")
NEO4J_USER = os.getenv("NEO4J_USER", "neo4j")
NEO4J_PASSWORD = os.getenv("NEO4J_PASSWORD")
driver = GraphDatabase.driver(NEO4J_URI, auth=(NEO4J_USER, NEO4J_PASSWORD))
def reset_neo4j():
    with driver.session() as session:
        session.run("MATCH (n) DETACH DELETE n")
    print("[INFO] Neo4j database reset: all nodes and relationships deleted.")

@app.post("/upload")
async def upload_file(file: UploadFile = File(...)):
    # Save uploaded file
    file_path = f"uploads/{file.filename}"
    with open(file_path, "wb") as buffer:
        shutil.copyfileobj(file.file, buffer)

    # Step 1: OCR extract text
    extracted_text = ocr_extract_text(file_path)

    # Step 2: Process text with ERNIE
    reset_neo4j
    database_title = process_text_to_graph(extracted_text)

    # Return response
    return {
        "title": database_title,
        "text_preview": extracted_text[:500],  # first 500 chars
        "message": "OCR + ERNIE processing complete!"
    }

@app.get("/graph")
def get_graph(title: str):
    title = title.strip()
    print(f"[INFO] Querying Neo4j for graph '{title}'...")
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
