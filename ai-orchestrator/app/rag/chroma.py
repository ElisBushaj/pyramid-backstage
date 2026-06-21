"""ChromaDB knowledge base — real retrieval that grounds the copilot.

Graceful + optional, exactly like the Redis session store: if ``chromadb`` isn't
installed (it's intentionally absent from the local venv) or the server is
unreachable, the ``KnowledgeBase`` becomes a NO-OP — every ``query`` returns ``[]``
and the copilot degrades to its structured-catalog behaviour. So this never blocks
local dev or a demo box without the chroma service; in docker (chroma compose
service, ``CHROMA_URL=http://chromadb:8000``) it lights up.

RAG GROUNDS, it is never a source of truth: availability + money always come from
ops-core, and plan-narrative numbers stay injected (non-negotiable #2). The KB
answers QUALITATIVE venue questions ("which hall is biggest?", "what setup for a
gala?") from the AUTHORITATIVE space catalog plus static setup/pricing notes.

Four collections:
  • venue_facts     — one doc per catalog space (kind, level, area, ceiling,
                      capacities, outdoor) + a few global + derived facts.
  • setup_templates — per-layout setup/teardown guidance.
  • pricing_rules   — prose pricing CONTEXT only (ops-core owns the totals).
  • past_events     — a couple of illustrative "what worked before" patterns.
"""

from __future__ import annotations

from typing import Any
from urllib.parse import urlparse

from ..config import settings

# Logical collection names — keep stable so seeding + retrieval agree.
COLLECTIONS = ("venue_facts", "setup_templates", "pricing_rules", "past_events")


class KnowledgeBase:
    """Thin, fail-soft wrapper over a ChromaDB client.

    Built via :func:`connect_knowledge_base`. When ``client is None`` (chromadb
    missing or server down) every method is a safe no-op, so callers never need to
    special-case "RAG is off" — they just get empty results.
    """

    def __init__(self, client: Any | None = None):
        self._client = client
        self._collections: dict[str, Any] = {}

    @property
    def available(self) -> bool:
        return self._client is not None

    def _collection(self, name: str) -> Any:
        if name not in self._collections:
            self._collections[name] = self._client.get_or_create_collection(name)
        return self._collections[name]

    def query(self, collection: str, text: str, n_results: int = 5) -> list[dict[str, Any]]:
        """Semantic search within a collection → ranked {document, metadata, distance}.

        Returns ``[]`` on any failure (no client, empty text, server error) so the
        copilot/planner can fall back to structured lookups without a try/except."""
        if not self.available or not text or not text.strip():
            return []
        try:
            res = self._collection(collection).query(query_texts=[text], n_results=n_results)
            docs = (res.get("documents") or [[]])[0]
            metas = (res.get("metadatas") or [[]])[0]
            dists = (res.get("distances") or [[]])[0]
            return [
                {
                    "document": doc,
                    "metadata": metas[i] if i < len(metas) else {},
                    "distance": dists[i] if i < len(dists) else None,
                }
                for i, doc in enumerate(docs)
            ]
        except Exception:
            return []

    def count(self, collection: str) -> int:
        if not self.available:
            return 0
        try:
            return int(self._collection(collection).count())
        except Exception:
            return 0

    def upsert(
        self,
        collection: str,
        ids: list[str],
        documents: list[str],
        metadatas: list[dict[str, Any]] | None = None,
    ) -> bool:
        """Idempotent insert/update by stable id. No-op (False) when unavailable."""
        if not self.available or not ids:
            return False
        try:
            self._collection(collection).upsert(
                ids=ids,
                documents=documents,
                metadatas=metadatas or [{"_": "1"} for _ in ids],
            )
            return True
        except Exception:
            return False


def connect_knowledge_base(url: str | None = None) -> KnowledgeBase:
    """Build a KnowledgeBase, connecting to the Chroma server when reachable.

    Any failure (chromadb not installed, server down, bad URL) → a no-op KB. The
    heartbeat detects an unreachable server at startup, not on the first query."""
    target = url or settings.CHROMA_URL
    try:
        import chromadb  # local: not installed → ImportError → no-op KB

        parsed = urlparse(target)
        host = parsed.hostname or "localhost"
        port = parsed.port or (443 if parsed.scheme == "https" else 8000)
        client = chromadb.HttpClient(host=host, port=port, ssl=parsed.scheme == "https")
        client.heartbeat()  # raises if the server isn't there
        return KnowledgeBase(client=client)
    except Exception:
        return KnowledgeBase(client=None)


# ═════════════════════════════════════════════════════════════════════════════
# Seed content — built from the AUTHORITATIVE catalog + small static tables.
# ═════════════════════════════════════════════════════════════════════════════
_SETUP_TEMPLATES: list[tuple[str, str]] = [
    ("THEATER", "Theater setup: rows of chairs facing a stage. Best for talks, keynotes, "
     "conferences and performances. Usually needs AV — microphones, projector, screen. "
     "Plan about 4 hours of setup before and 2 hours of teardown after."),
    ("CLASSROOM", "Classroom setup: tables and chairs in rows facing the front. Best for "
     "training, courses and hands-on workshops. Often needs power at each table and a screen."),
    ("BANQUET", "Banquet setup: round tables seating 8–10 guests. Best for gala dinners, "
     "weddings and awards nights. Needs catering and usually a small stage for speeches."),
    ("RECEPTION", "Reception setup: open standing space with a few high tables. Best for "
     "networking, mixers, cocktail receptions and exhibition openings. Highest capacity per m²."),
    ("CABARET", "Cabaret setup: half-moon seating at round tables facing a stage. Best for "
     "shows and table-seated talks where guests still face the front."),
    ("BOARDROOM", "Boardroom setup: a single large table with everyone around it. Best for "
     "executive and board meetings and small leadership sessions."),
]
_PRICING_RULES: list[tuple[str, str]] = [
    ("dayrate", "Pricing: every space has a day rate that scales with its size. ops-core "
     "computes the authoritative quote total — the copilot never invents prices. VAT is 20%."),
    ("addons", "AV and catering are priced as separate line items added on top of the space "
     "day rate, so a bare hall costs less than a fully serviced one."),
]
_PAST_EVENTS: list[tuple[str, str]] = [
    ("conf-180", "A 180-person startup conference ran as a multi-space plan: the largest "
     "level -1 hall as the plenary, Floor-0 boxes as breakout rooms, and a foyer for "
     "registration."),
    ("gala-200", "A 200-guest gala dinner used a single large hall in banquet layout with "
     "catering and a small stage for the speeches."),
]
_GLOBAL_FACTS: list[tuple[str, str]] = [
    ("layout", "The Pyramid of Tirana is a radial building: a central atrium of grand "
     "staircases, concentric ring corridors, and wedge-shaped rooms along 16 radial axes, "
     "across levels -1, 0 and 3."),
    ("where", "The largest bookable halls are on level -1. Floor 0 holds the main entrance "
     "and smaller boxes used as breakout rooms. Floor 3 has upper boxes and sloped roof "
     "terraces, some of them outdoor."),
]


def _max_cap(s: dict[str, Any]) -> int:
    return max((s.get("capacities") or {}).values(), default=0)


def _space_fact(s: dict[str, Any]) -> tuple[str, str, dict[str, Any]]:
    """One natural-language venue_facts doc + clean (no-None) metadata for a space."""
    m = s.get("map") or {}
    caps = s.get("capacities") or {}
    floor = s.get("floor")
    kind = (m.get("spaceKind") or s.get("category") or "space").replace("_", " ")
    bits = [f"{s['name']} is a {kind} on floor {floor} of the Pyramid of Tirana."]
    bits.append(
        "Bookable." if m.get("bookable")
        else "Not bookable (a service or circulation space)."
    )
    if m.get("areaApproxM2"):
        bits.append(f"Approximately {m['areaApproxM2']} m².")
    if m.get("ceilingMeters"):
        bits.append(f"Ceiling about {m['ceilingMeters']} m.")
    if caps:
        cap_txt = ", ".join(
            f"{k.title()} ~{v}" for k, v in sorted(caps.items(), key=lambda kv: -kv[1])
        )
        bits.append(f"Capacity by setup: {cap_txt}.")
    if m.get("outdoor"):
        bits.append(
            "Outdoor, weather-dependent." if m.get("weatherDependent") else "Outdoor space."
        )
    meta = {
        "slug": str(s.get("slug", "")),
        "name": str(s.get("name", "")),
        "floor": int(s["floor"]) if isinstance(s.get("floor"), int) else 0,
        "category": str(s.get("category", "")),
        "bookable": bool(m.get("bookable")),
        "max_capacity": int(_max_cap(s)),
    }
    return f"space:{s['slug']}", " ".join(bits), meta


def seed_knowledge(kb: KnowledgeBase | None = None, venue: Any | None = None) -> bool:
    """Seed the four collections from the catalog + static tables (idempotent by id).

    No-op (returns False) when the KB is unavailable, so calling it at startup is
    always safe. Re-running upserts by stable id, so it never duplicates."""
    kb = kb or get_knowledge_base()
    if not kb.available:
        return False
    if venue is None:
        from ..venue import get_venue

        venue = get_venue()

    ids, docs, metas = [], [], []
    for s in venue.spaces:
        i, d, meta = _space_fact(s)
        ids.append(i)
        docs.append(d)
        metas.append(meta)
    for key, doc in _GLOBAL_FACTS:
        ids.append(f"global:{key}")
        docs.append(doc)
        metas.append({"kind": "global"})
    # Derived "biggest halls" fact so "largest space?" retrieves a direct answer.
    halls = venue.halls_by_capacity(None)[:3]
    if halls:
        listing = ", ".join(f"{h['name']} (~{_max_cap(h)} people)" for h in halls)
        ids.append("global:biggest")
        docs.append(f"The largest bookable spaces by capacity are: {listing}.")
        metas.append({"kind": "global"})

    ok = kb.upsert("venue_facts", ids, docs, metas)
    kb.upsert(
        "setup_templates",
        [f"setup:{layout}" for layout, _ in _SETUP_TEMPLATES],
        [doc for _, doc in _SETUP_TEMPLATES],
        [{"layout": layout} for layout, _ in _SETUP_TEMPLATES],
    )
    kb.upsert(
        "pricing_rules",
        [f"price:{key}" for key, _ in _PRICING_RULES],
        [doc for _, doc in _PRICING_RULES],
        [{"kind": "pricing"} for _ in _PRICING_RULES],
    )
    kb.upsert(
        "past_events",
        [f"past:{key}" for key, _ in _PAST_EVENTS],
        [doc for _, doc in _PAST_EVENTS],
        [{"kind": "past_event"} for _ in _PAST_EVENTS],
    )
    return ok


# Module-level singleton accessor.
_kb: KnowledgeBase | None = None


def get_knowledge_base() -> KnowledgeBase:
    """Return a process-wide ``KnowledgeBase`` singleton (connects on first use)."""
    global _kb
    if _kb is None:
        _kb = connect_knowledge_base()
    return _kb
