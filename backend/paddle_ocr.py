import base64
from datetime import datetime, timezone
import os

import requests
from dotenv import load_dotenv

load_dotenv()

API_URL = "https://p9w3gdq1h7w7t0le.aistudio-app.com/layout-parsing"
TOKEN = os.environ.get("AI_STUDIO_API_KEY")
OUTPUT_DIR = "output"

def ocr_extract_text(file_path: str, output_path: str | None = None) -> str:
    """
    Detects if the file is a PDF or image based on extension,
    sends it to PaddleOCR via AI Studio API, saves images locally,
    and writes the extracted text to a file. Returns the output file path.
    """
    # Determine file type
    ext = os.path.splitext(file_path)[1].lower()
    if ext in [".pdf"]:
        file_type = 0  # PDF
    elif ext in [".jpg", ".jpeg", ".png", ".bmp", ".tiff"]:
        file_type = 1  # Image
    else:
        raise ValueError(f"Unsupported file type: {ext}")

    # Read and encode file
    with open(file_path, "rb") as f:
        file_bytes = f.read()
        file_data = base64.b64encode(file_bytes).decode("ascii")

    # Prepare headers and payload
    if not TOKEN:
        raise RuntimeError("AI_STUDIO_API_KEY is not set in environment.")
    headers = {
        "Authorization": f"token {TOKEN}",
        "Content-Type": "application/json",
        "x-bce-date": datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%SZ"),
    }

    required_payload = {
        "file": file_data,
        "fileType": file_type
    }

    optional_payload = {
        "useDocOrientationClassify": False,
        "useDocUnwarping": False,
        "useChartRecognition": False,
    }
    payload = {**required_payload, **optional_payload}

    # Send request
    response = requests.post(API_URL, json=payload, headers=headers)
    if response.status_code != 200:
        raise RuntimeError(
            f"Failed OCR request: {response.status_code} {response.text}"
        )

    result = response.json().get("result", {})

    extracted_texts = []

    for i, res in enumerate(result["layoutParsingResults"]):
        md_text = res.get("markdown", {}).get("text")
        if md_text:
            extracted_texts.append(md_text)

    joined_text = "\n".join(extracted_texts)

    return joined_text
