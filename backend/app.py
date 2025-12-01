# backend/main.py
import os
import re
import shutil
from datetime import datetime

from dotenv import load_dotenv
from ernie import extract_entities_chunked  # ERNIE function
from fastapi import FastAPI, File, HTTPException, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from graph import (get_all_databases, process_text_to_graph,  # Neo4j functions
                   retrieve_graph)
from neo4j import GraphDatabase
from paddle_ocr import ocr_extract_text  # OCR function

os.makedirs("uploads", exist_ok=True)
os.makedirs("output", exist_ok=True)  # new: where extracted text files are saved

app = FastAPI()

# Allow frontend requests
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.post("/upload")
async def upload_file(file: UploadFile = File(...)):
    # Save uploaded file
    file_path = f"uploads/{file.filename}"
    with open(file_path, "wb") as buffer:
        shutil.copyfileobj(file.file, buffer)
    
    # Deterministic output path for extracted text
    base = os.path.splitext(os.path.basename(file.filename))[0] or "document"
    safe_base = re.sub(r"[^A-Za-z0-9._-]+", "-", base).strip("-_.")
    out_name = f"{safe_base}.txt"
    out_path = os.path.join("output", out_name)

    # Step 1: OCR extract text (only if not already extracted)
    if os.path.isfile(out_path):
        print(f"[INFO] Using existing extracted text: {out_name}")
        with open(out_path, "r", encoding="utf-8") as f:
            extracted_text = f.read()
    else:
        print("[INFO] Extracting text from file...")
        extracted_text = ocr_extract_text(file_path)
        with open(out_path, "w", encoding="utf-8") as f:
            f.write(extracted_text)

    # Step 2: ERNIE extract entities and relations
    print("[INFO] Extracting entities and relations from text...")
    result = extract_entities_chunked(extracted_text, max_len=20000)

    # Step 3: Process text with Neo4j
    print("[INFO] Processing text with Neo4j...")
    database_title = process_text_to_graph(result)

    # Return response
    return {
        "title": database_title,
        "text_preview": extracted_text[:500],  # first 500 chars
        "text_file": f"/download/{out_name}",  # download path
        "message": "OCR + ERNIE processing complete!"
    }

@app.get("/download/{filename}")
def download_extracted_text(filename: str):
    # basic sanitization to prevent path traversal
    if "/" in filename or "\\" in filename:
        raise HTTPException(status_code=400, detail="Invalid filename.")
    path = os.path.join("output", filename)
    if not os.path.isfile(path):
        raise HTTPException(status_code=404, detail="File not found.")
    return FileResponse(path, media_type="text/plain", filename=filename)

@app.get("/graph")
def get_graph(title: str):
    title = title.strip()
    print(f"[INFO] Querying Neo4j for graph '{title}'...")
    return retrieve_graph(title)

@app.get("/sidebar")
def get_sidebar():
    return get_all_databases()