"""RAG layer (Alvin's lane) — ChromaDB-backed venue knowledge.

Fail-soft: the KnowledgeBase degrades to a no-op when chromadb/the server is
absent, so importing + calling is always safe. See ``chroma.py``.
"""

from .chroma import (
    KnowledgeBase,
    connect_knowledge_base,
    get_knowledge_base,
    seed_knowledge,
)

__all__ = [
    "KnowledgeBase",
    "connect_knowledge_base",
    "get_knowledge_base",
    "seed_knowledge",
]
