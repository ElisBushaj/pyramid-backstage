"""Venue knowledge — structured retrieval over the space catalog (Phase C v1).

Loads the bundled space catalog and answers the spatial questions the planner
needs: look a space up by name, get its adjacency, propose a space **bundle**
(main hall + complementary spaces), and flag **circulation/access** impacts.

No ChromaDB/embeddings here — the catalog is small + structured, so plain lookups
beat a vector store. Fuzzy retrieval over past events is the deferred upgrade
(see ``app/rag/chroma.py``). The catalog is matched to ops-core spaces by **name**
(stable across the mock's string ids and real ops-core's UUIDs).
"""

from __future__ import annotations

import json
from functools import lru_cache
from pathlib import Path
from typing import Any

from .config import settings

_DEFAULT_PATH = Path(__file__).parent / "data" / "spaces.catalog.json"

# event type -> bundle template key (in the catalog's bundleTemplates)
_TEMPLATE_FOR = {
    "CONFERENCE": "conference",
    "WORKSHOP": "conference",
    "EXHIBITION": "exhibition",
    "PERFORMANCE": "gala",
    "COMMUNITY": "gala",
    "PRIVATE": "gala",
}


class VenueKnowledge:
    """In-memory index over the space catalog."""

    def __init__(self, path: Path | None = None):
        p = Path(settings.CATALOG_PATH) if settings.CATALOG_PATH else (path or _DEFAULT_PATH)
        data = json.loads(p.read_text(encoding="utf-8"))
        self.spaces: list[dict[str, Any]] = data.get("spaces", [])
        self.templates: list[dict[str, Any]] = data.get("bundleTemplates", [])
        self._by_slug = {s["slug"]: s for s in self.spaces}
        self._by_name = {s["name"].lower(): s for s in self.spaces}

    def by_slug(self, slug: str) -> dict[str, Any] | None:
        return self._by_slug.get(slug)

    def by_name(self, name: str) -> dict[str, Any] | None:
        return self._by_name.get(name.lower())

    def adjacent(self, slug: str) -> list[dict[str, Any]]:
        s = self._by_slug.get(slug)
        if not s:
            return []
        return [self._by_slug[a] for a in s.get("adjacent", []) if a in self._by_slug]

    def propose_bundle(self, *, event_type: str, primary_slug: str) -> list[dict[str, Any]]:
        """Complementary spaces for the event, per the matching bundle template.

        Prefers a space ADJACENT to the primary whose category fits the role
        (e.g. registration → an adjacent ENTRANCE/ATRIUM/TRANSITIONAL); falls back
        to any same-floor space of that category. The primary itself is excluded.
        """
        primary = self._by_slug.get(primary_slug)
        if not primary:
            return []
        template = next(
            (t for t in self.templates if t.get("key") == _TEMPLATE_FOR.get(event_type, "conference")),
            None,
        )
        if not template:
            return []

        bundle: list[dict[str, Any]] = []
        used = {primary_slug}
        adj = self.adjacent(primary_slug)
        for role in template.get("roles", []):
            if role.get("role") == "main":
                continue
            cats = role.get("category")
            cats = [cats] if isinstance(cats, str) else list(cats or [])
            cand = next((s for s in adj if s["category"] in cats and s["slug"] not in used), None)
            if cand is None:
                cand = next(
                    (
                        s
                        for s in self.spaces
                        if s["category"] in cats
                        and s["floor"] == primary["floor"]
                        and s["slug"] not in used
                    ),
                    None,
                )
            if cand is None:
                continue
            used.add(cand["slug"])
            bundle.append(
                {
                    "role": role["role"],
                    "slug": cand["slug"],
                    "name": cand["name"],
                    "category": cand["category"],
                    "isCirculation": bool(cand.get("isCirculation")),
                    "reason": role.get("note", ""),
                }
            )
        return bundle

    def circulation_warnings(self, slugs: list[str]) -> list[str]:
        """Flag chosen circulation spaces whose neighbours' access could be affected."""
        out: list[str] = []
        chosen = set(slugs)
        for slug in slugs:
            s = self._by_slug.get(slug)
            if not s or not s.get("isCirculation"):
                continue
            affected = [
                self._by_slug[a]["name"]
                for a in s.get("adjacent", [])
                if a in self._by_slug
                and a not in chosen
                and self._by_slug[a]["category"] in ("HALL", "BOX")
            ]
            if affected:
                out.append(
                    f"{s['name']} is a circulation space - using it routes foot traffic past "
                    f"{', '.join(affected[:3])}; keep access clear during the event."
                )
        return out


@lru_cache
def get_venue() -> VenueKnowledge:
    """Process-wide venue-knowledge singleton."""
    return VenueKnowledge()
