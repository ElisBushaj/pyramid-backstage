"""ai-orchestrator — Pyramid Backstage AI service (Alvin's lane).

SCAFFOLD ONLY. The conversational copilot, the deterministic planning graph, and
the RAG layer are stubs with clear `NotImplementedError`/TODO markers pointing at
the backlog in ``docs/06-features/A00-ai-orchestrator``.

This service holds **no domain state**. Everything true comes from ops-core via
the contract (``ops-core/openapi.yaml``); the only coupling is ``OPS_CORE_URL``.
"""

__version__ = "0.1.0"
