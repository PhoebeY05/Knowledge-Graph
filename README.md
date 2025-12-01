# Knowledge Graph

Upload any PDF or image file to obtain an in-depth analysis of its contents in the form of an entity-relationship graph.

## Features

- Upload files
  - Drag & drop or browse to select a PDF/JPG/PNG
  - Backend runs OCR, chunks text, calls ERNIE API, and ingests entities/relations into Neo4j
  - Extracted text is saved to `backend/output/<safe-name>.txt` for reuse

- View the graph
  - Force-directed layout
  - Click a node to center and smoothly zoom in
  - Collision force to avoid overlapping text

- Search nodes and links
  - Type to highlight matching nodes and relation labels
  - Matching nodes/links are emphasized on the canvas

- Sidebar
  - Collapsible sidebar with links
  - “Graphs” submenu loads available Neo4j databases from `/sidebar`

## Getting Started

Frontend

1. Open a terminal
2. Change directory to the frontend

   ```
   cd frontend
   ```

3. Start the dev server

   ```
   npx vite
   ```

Backend

1. Open another terminal
2. Change directory to the backend

   ```
   cd backend
   ```

3. Activate the virtual environment

   ```
   source bin/activate
   ```

4. Run the API server

   ```
   uvicorn app:app --reload
   ```

Neo4j
1. Download [Neo4j Desktop](https://neo4j.com/download/?utm_source=GSearch&utm_medium=PaidSearch&utm_campaign=Evergreen&utm_content=APAC-Search-SEMBrand-Evergreen-None-SEM-SEM-NonABM&utm_term=download%20neo4j&utm_adgroup=download&gad_source=1&gad_campaignid=20769286994&gbraid=0AAAAADk9OYrdv7YFGfzvNI67cuboxYR9q&gclid=CjwKCAiA86_JBhAIEiwA4i9Ju1RMX3ogQktaLBKpixhMsb7psrXHx0zwkS901OZcyT6svZP5mo9MvRoCjbwQAvD_BwE)

2. Replace the below code snippet in `graph.py` if needed
```
NEO4J_URI = os.getenv("NEO4J_URI", "neo4j://127.0.0.1:7687")
NEO4J_USER = os.getenv("NEO4J_USER", "neo4j")
```


## API Endpoints

- POST `/upload`
  - multipart/form-data with `file`
  - Returns `{ title, text_preview, text_file }`
  - Creates/ensures a Neo4j database and ingests entities/relations

- GET `/graph?title=<db>`
  - Returns `{ nodes: [{id,label}], links: [{source,target,label}] }`
  - Graph is collapsed to undirected pairs for bidirectional links

- GET `/sidebar`
  - Returns an array of database names (excluding `system`)

## Notes

- Neo4j configuration & ERNIE API key is loaded from backend environment variables (`NEO4J_PASSWORD` and `AI_STUDIO_API_KEY`).
- Backend URL is loaded from frontend environment variables (`VITE_API_BASE_URL`).
- The backend limits request size to fit ERNIE’s input constraints by chunking and trimming text.
