# AI-powered Obsidian Plugin - your better 2nd brain

embedding optimization:
- exclude headings from embeddings
- skip initial words (for templates/format text) and only embed main content and set word limit for faster embeddings

## how to implement local embedding
```bash
python3 -m venv venv # create virtual environment
source venv/bin/activate # activate virtual environment

pip install fastapi uvicorn sentence-transformers torch numpy
uvicorn local_embedding_server:app --host 127.0.0.1 --port 8000

curl http://127.0.0.1:8000/health # optional health check
```
