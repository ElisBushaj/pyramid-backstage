# ─────────────────────────────────────────────────────────────────────────────
# ai-orchestrator — PRODUCTION image. FastAPI under uvicorn, no --reload.
# Holds no domain state; talks to ops-core over OPS_CORE_URL with the service token.
# ─────────────────────────────────────────────────────────────────────────────
FROM python:3.12-slim

ENV PYTHONUNBUFFERED=1 \
    PYTHONDONTWRITEBYTECODE=1 \
    PIP_NO_CACHE_DIR=1 \
    PIP_DISABLE_PIP_VERSION_CHECK=1

WORKDIR /app

# Install runtime deps first for layer caching (non-editable install).
COPY pyproject.toml README.md ./
COPY app ./app
RUN pip install .

EXPOSE 8000

# Single worker: the in-memory session state in the scaffold is per-process.
# Scale via replicas + shared Redis once the graph is real (Alvin's lane).
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000", "--workers", "1"]
