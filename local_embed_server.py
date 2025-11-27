# Simple local embedding server using FastAPI and sentence-transformers
# Model: thenlper/gte-large
# Usage:
#   python3 -m venv .venv
#   source .venv/bin/activate
#   pip install fastapi uvicorn sentence-transformers torch numpy
#   uvicorn local_embed_server:app --host 127.0.0.1 --port 8000
# Endpoint:
#   POST /embed {"text": "your text"} -> {"embedding": [...]} 

from fastapi import FastAPI, HTTPException, Response
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from sentence_transformers import SentenceTransformer
import numpy as np

app = FastAPI(title="Local Embedding Server", version="1.0")

# Allow CORS from local Obsidian/WebView
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],  # include OPTIONS for preflight
    allow_headers=["*"]
)

class EmbedRequest(BaseModel):
    text: str

class EmbedResponse(BaseModel):
    embedding: list

# Load model at startup
try:
    model = SentenceTransformer("thenlper/gte-large")
except Exception as e:
    # Fallback: allow starting without model; requests will fail explicitly
    model = None
    print("[ERROR] Failed to load model thenlper/gte-large:", e)

# Explicitly support both /embed and /embed/ paths
@app.post("/embed", response_model=EmbedResponse)
async def embed(req: EmbedRequest):
    if model is None:
        raise HTTPException(status_code=500, detail="Model not loaded. Check server logs.")
    try:
        vec = model.encode(req.text, normalize_embeddings=True)
        return {"embedding": vec.tolist()}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Embedding failed: {e}")

@app.get("/health")
async def health():
    return {"status": "ok", "model": "thenlper/gte-large", "loaded": model is not None}

# Explicit OPTIONS handler for CORS preflight (covers Electron/Obsidian webview quirks)
@app.options("/embed")
async def options_embed():
    return Response(status_code=200)

# Mirror for trailing slash
@app.post("/embed/")
async def embed_slash(req: EmbedRequest):
    return await embed(req)

@app.options("/embed/")
async def options_embed_slash():
    return Response(status_code=200)
