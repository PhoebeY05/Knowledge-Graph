import json
import os
import re
from datetime import datetime, timezone
from textwrap import wrap
import time 

import requests
from dotenv import load_dotenv

# -----------------------------
# Load environment variables
# -----------------------------
load_dotenv()

API_URL = "https://aistudio.baidu.com/llm/lmapi/v3/chat/completions"
TOKEN = os.getenv("AI_STUDIO_API_KEY")

# Model/context limits
_TOKEN_LIMIT = 5120          # reported by API error
_TOKEN_SAFETY = 400          # keep headroom for headers/serialization

# --- chunking & merging helpers ---
def _chunk_text(text: str, max_len: int = 20000):
    """
    Yield text chunks of length <= max_len, preferring to break on whitespace.
    """
    if not text:
        return
    n = len(text)
    i = 0
    while i < n:
        end = min(i + max_len, n)
        if end < n and not text[end - 1].isspace():
            # backtrack to last whitespace within this window
            ws = text.rfind(" ", i, end)
            if ws != -1 and ws > i:
                end = ws + 1
        yield text[i:end]
        i = end

def _normalize_key(s: str | None):
    return (s or "").strip().lower()

# -----------------------------
# ERNIE helpers
# -----------------------------
def safe_parse_json(raw_output: str):
    """Extract JSON from ERNIE output safely, returns empty lists if parsing fails"""
    match = re.search(r"\{.*\}", raw_output, re.DOTALL)
    if match:
        try:
            return json.loads(match.group())
        except json.JSONDecodeError:
            return {"entities": [], "relations": []}
    return {"entities": [], "relations": []}

# Build the exact prompt so we can measure overhead length reliably
def _build_prompt(text: str) -> str:
    # Compact prompt to minimize overhead
    return f'''Extract entities and relations from the text and return ONLY JSON:
{{
"title": "...",
"entities": [{{"id":"E1","type":"Organization|Person|Date|Money|Clause|Term|...","text":"...","canonical":"..."}} ],
"relations": [{{"from":"E1","to":"E2","type":"employs|owes|mentions|amends|...","confidence":0.0,"evidence_span":"..."}} ]
}}
Text: "{text}"'''

def _estimate_tokens(s: str) -> int:
    # Heuristic: ~4 chars per token (conservative)
    return max(1, (len(s) + 3) // 4)

def _fit_text_to_token_budget(text: str) -> str:
    """
    Trim text so that _build_prompt(text) fits within _TOKEN_LIMIT - _TOKEN_SAFETY tokens.
    """
    if not text:
        return text
    # Tokens available for the 'text' portion (approx)
    overhead_tokens = _estimate_tokens(_build_prompt(""))
    budget_tokens = max(1000, _TOKEN_LIMIT - overhead_tokens - _TOKEN_SAFETY)
    # Convert to a conservative char budget (3 chars per token)
    char_budget = max(1000, budget_tokens * 3)
    if len(text) > char_budget:
        # cut at whitespace within budget
        cut = text.rfind(" ", 0, char_budget)
        text = text[: cut if cut > 0 else char_budget]
    # Final guard: iterative shrink if still over
    while _estimate_tokens(_build_prompt(text)) > (_TOKEN_LIMIT - _TOKEN_SAFETY) and len(text) > 1000:
        text = text[: int(len(text) * 0.9)]
    return text

def extract_entities(text: str) -> dict:
    """
    Sends text to ERNIE API via requests, returns entities and relations as dict.
    """
    MAX_RETRIES = 3
    BACKOFF_FACTOR = 0.5

    prompt = _build_prompt(text)

    payload = {
        "model": "ernie-3.5-8k",
        "messages": [
            {"role": "system", "content": "You are an ERNIE developer assistant for entity/relation extraction."},
            {"role": "user", "content": prompt}
        ]
    }

    for attempt in range(MAX_RETRIES):
        try:
            # Recalculate the date header for every attempt to ensure freshness
            headers = {
                "Authorization": f"token {TOKEN}",
                "Content-Type": "application/json",
                "x-bce-date": datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%SZ"),
            }

            # Use the 'json' parameter for automatic JSON serialization and header setting
            response = requests.post(API_URL, json=payload, headers=headers)

            if response.status_code == 200:
                raw_output = response.json().get("choices", [{}])[0].get("message", {}).get("content", "")
                if not raw_output:
                    return {"entities": [], "relations": []}
                return safe_parse_json(raw_output)

            # Check for the specific clock skew/header error to allow retries
            if response.status_code == 404 and "MissingDateHeader" in response.text:
                if attempt < MAX_RETRIES - 1:
                    wait_time = BACKOFF_FACTOR * (2 ** attempt)
                    # Use time.sleep for exponential backoff before the next retry
                    time.sleep(wait_time)
                    continue
            
            # For unrecoverable errors or if retries are exhausted, raise the error
            raise RuntimeError(f"ERNIE API failed: {response.status_code} {response.text}")

        except requests.exceptions.RequestException as e:
            # Handle connectivity or timeout errors
            if attempt < MAX_RETRIES - 1:
                wait_time = BACKOFF_FACTOR * (2 ** attempt)
                time.sleep(wait_time)
                continue
            raise RuntimeError(f"ERNIE API failed after {MAX_RETRIES} attempts due to request exception: {e}")
    
    # Fallback return (should be unreachable if the final raise is hit)
    return {"entities": [], "relations": []}


def extract_entities_chunked(text: str, max_len: int = 20000) -> dict:
    """
    Break text into chunks, call extract_entities per chunk, and merge results:
    - entities deduped by canonical (fallback to text)
    - relations remapped to combined entity ids
    """
    combined_entities: list[dict] = []
    combined_relations: list[dict] = []
    canonical_to_id: dict[str, str] = {}
    first_title: str | None = None

    # Use char chunking as a first pass; token budget fitting happens per chunk below
    for chunk_idx, chunk in enumerate(_chunk_text(text, max_len=max_len)):
        fit = _fit_text_to_token_budget(chunk)
        if not fit:
            continue
        res = extract_entities(fit)  # calls ERNIE API
        if not first_title:
            first_title = res.get("title")
        entities = res.get("entities", []) or []
        relations = res.get("relations", []) or []

        local_to_combined: dict[str, str] = {}

        for e in entities:
            canonical_key = _normalize_key(e.get("canonical") or e.get("text") or e.get("id"))
            if not canonical_key:
                continue
            if canonical_key in canonical_to_id:
                combined_id = canonical_to_id[canonical_key]
            else:
                base_local_id = str(e.get("id") or f"E{len(combined_entities)+1}")
                combined_id = f"c{chunk_idx}_{base_local_id}"
                canonical_to_id[canonical_key] = combined_id
                combined_entities.append({
                    "id": combined_id,
                    "type": e.get("type", ""),
                    "text": e.get("text", ""),
                    "canonical": e.get("canonical", e.get("text", "")),
                })
            local_to_combined[str(e.get("id"))] = combined_id

        for r in relations:
            src_local = str(r.get("from"))
            dst_local = str(r.get("to"))
            src_id = local_to_combined.get(src_local)
            dst_id = local_to_combined.get(dst_local)
            if not src_id or not dst_id:
                continue
            combined_relations.append({
                "from": src_id,
                "to": dst_id,
                "type": r.get("type", "related"),
                "confidence": r.get("confidence", 0.0),
                "evidence_span": r.get("evidence_span", ""),
            })

    return {
        "title": first_title or "graph",
        "entities": combined_entities,
        "relations": combined_relations,
    }