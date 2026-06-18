"""RAG layer (Alvin's lane) — ChromaDB-backed venue knowledge.

SCAFFOLD ONLY. Re-exports the client wrapper + the seed entrypoint; the bodies
are stubs (see ``docs/06-features/A00-ai-orchestrator``).
"""

from .chroma import KnowledgeBase, get_knowledge_base, seed_knowledge

__all__ = ["KnowledgeBase", "get_knowledge_base", "seed_knowledge"]
