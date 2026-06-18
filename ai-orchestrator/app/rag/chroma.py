"""ChromaDB client wrapper + knowledge seeding (Alvin's lane).

╔══════════════════════════════════════════════════════════════════════════════╗
║ SCAFFOLD ONLY. The RAG retrieval that grounds the copilot/planner lives here. ║
║ The CLASS SHAPE + collection names are fixed; the bodies are stubs. Implement ║
║ against docs/06-features/A00-ai-orchestrator.                                  ║
╚══════════════════════════════════════════════════════════════════════════════╝

RAG is used to *rank and ground* — e.g. pick among matched spaces by features /
past events, and key setup-task templates on space+layout+attendees. It NEVER
becomes a source of truth for availability or money: those always come from
ops-core via the contract. The AI reasons *over* venue knowledge, not *with*
invented facts.

Four logical collections seed the knowledge base:
  • venue_facts      — the four halls, capacities, features, buffers, floors.
  • setup_templates  — setup/teardown task templates per layout/space/size.
  • pricing_rules    — narrative pricing context (the AUTHORITATIVE numbers are
                       still ops-core's; this is for *explanation*, not totals).
  • past_events      — historical events for similarity / "what worked before".
"""

from __future__ import annotations

from typing import Any

from ..config import settings

# Logical collection names — keep stable so seeding + retrieval agree.
COLLECTIONS = ("venue_facts", "setup_templates", "pricing_rules", "past_events")

_A00 = "Alvin: implement {what} — see docs/06-features/A00-ai-orchestrator"


class KnowledgeBase:
    """Thin wrapper over a ChromaDB client.

    TODO (A00): In ``__init__``, construct a Chroma client against
    ``settings.CHROMA_URL`` (e.g. ``chromadb.HttpClient(...)``) and lazily
    get-or-create the four ``COLLECTIONS``. Expose a ``query(collection, text,
    n_results)`` helper the planner/copilot can call. Choose an embedding
    function (Anthropic/local) consistent with how documents are seeded.
    """

    def __init__(self, chroma_url: str | None = None):
        self.chroma_url = chroma_url or settings.CHROMA_URL
        # TODO (A00): self._client = chromadb.HttpClient(...) and get-or-create
        # the COLLECTIONS. Left unset so import stays side-effect-free.
        self._client: Any | None = None

    def query(self, collection: str, text: str, n_results: int = 5) -> list[dict[str, Any]]:
        """Semantic search within a collection → ranked documents + metadata.

        TODO (A00): embed ``text`` and query the named Chroma collection;
        return the hits (document, metadata, distance) for the planner to rank on.
        """
        raise NotImplementedError(_A00.format(what="KnowledgeBase.query"))


# Module-level singleton accessor (lazily built once wired).
_kb: KnowledgeBase | None = None


def get_knowledge_base() -> KnowledgeBase:
    """Return a process-wide ``KnowledgeBase`` singleton."""
    global _kb
    if _kb is None:
        _kb = KnowledgeBase()
    return _kb


def seed_knowledge(kb: KnowledgeBase | None = None) -> None:
    """Seed the four collections with venue knowledge (idempotent).

    TODO (A00): Upsert documents into each of ``COLLECTIONS``:
      • venue_facts     — Blue/Orange/Green/Yellow halls: capacities per layout,
                          features (stage, av_builtin, step_free), setup/teardown
                          buffers, floor. (Mirror the seed in mock-ops-core /
                          ops-core's seed so the AI's facts match the store.)
      • setup_templates — per-(layout, size) SETUP/TEARDOWN task templates with
                          owners + dueOffsetHours (e.g. "Set up theater seating
                          (180)" at -4h).
      • pricing_rules   — prose pricing context for narrative explanation only;
                          ops-core computes the actual totals.
      • past_events     — a handful of historical events for similarity lookups.

    Intended to be run once at startup or via a maintenance script. Stubbed.
    """
    raise NotImplementedError(_A00.format(what="seed_knowledge"))
