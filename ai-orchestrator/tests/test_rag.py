"""RAG knowledge-base tests — the fail-soft no-op path + seed construction.

chromadb is intentionally absent from the local venv, so these run with NO server:
they exercise the graceful no-op KB and the pure seed-content builders (catalog →
docs + chroma-safe metadata), without ever touching a real ChromaDB.
"""

from __future__ import annotations

from app.rag.chroma import (
    KnowledgeBase,
    _space_fact,
    connect_knowledge_base,
    seed_knowledge,
)
from app.venue import get_venue


def test_noop_kb_is_unavailable_and_returns_empty() -> None:
    kb = KnowledgeBase(client=None)
    assert kb.available is False
    assert kb.query("venue_facts", "biggest hall") == []
    assert kb.count("venue_facts") == 0
    assert kb.upsert("venue_facts", ["x"], ["doc"]) is False


def test_connect_degrades_to_noop_without_a_server() -> None:
    # Unroutable target -> a no-op KB, never raises (chromadb may also be absent).
    kb = connect_knowledge_base("http://127.0.0.1:1/")
    assert kb.available is False


def test_space_fact_builds_grounded_doc_with_clean_metadata() -> None:
    s = {
        "slug": "space-1", "name": "Main hall", "floor": -1, "category": "HALL",
        "capacities": {"THEATER": 300, "RECEPTION": 500},
        "map": {
            "level": -1, "spaceKind": "GRAND_HALL", "bookable": True,
            "areaApproxM2": 450, "ceilingMeters": 6.2,
        },
    }
    sid, doc, meta = _space_fact(s)
    assert sid == "space:space-1"
    assert "Main hall" in doc and "floor -1" in doc and "Bookable" in doc
    assert "Reception ~500" in doc  # largest capacity is listed first
    # chroma metadata must be primitives only, never None
    assert meta["bookable"] is True and meta["max_capacity"] == 500
    assert all(v is not None for v in meta.values())


def test_seed_is_noop_when_unavailable() -> None:
    assert seed_knowledge(KnowledgeBase(client=None)) is False


class _CapturingKB(KnowledgeBase):
    """Available KB that records upserts instead of hitting a server."""

    def __init__(self) -> None:
        super().__init__(client=object())  # non-None -> available
        self.calls: dict[str, list[str]] = {}

    def upsert(self, collection, ids, documents, metadatas=None) -> bool:  # type: ignore[override]
        self.calls[collection] = list(ids)
        return True


def test_seed_populates_all_four_collections_from_the_catalog() -> None:
    kb = _CapturingKB()
    assert seed_knowledge(kb, get_venue()) is True
    assert set(kb.calls) == {"venue_facts", "setup_templates", "pricing_rules", "past_events"}
    assert any(i.startswith("space:") for i in kb.calls["venue_facts"])
    assert "global:biggest" in kb.calls["venue_facts"]  # derived "largest halls" fact
    assert len(kb.calls["setup_templates"]) == 6  # one per layout
