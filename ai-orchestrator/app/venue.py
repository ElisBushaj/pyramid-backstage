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

# Capacity model (matches the catalog generator): floor(area / density m2-per-person).
_DENSITY = {
    "RECEPTION": 0.8, "THEATER": 1.5, "CLASSROOM": 2.0,
    "BANQUET": 1.8, "BOARDROOM": 3.0, "CABARET": 2.2,
}


def capacity_for(area_m2: float | None, setup: str) -> int | None:
    """floor(area / density) for a setup — the spec's editable, computed capacity."""
    if not area_m2 or setup not in _DENSITY:
        return None
    return max(1, int(area_m2 / _DENSITY[setup]))


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

    @staticmethod
    def _bookable(s: dict[str, Any]) -> bool:
        return (s.get("map") or {}).get("bookable") is True

    def halls_by_capacity(
        self, layout: str | None, *, exclude: set[str] = frozenset()
    ) -> list[dict[str, Any]]:
        """Bookable HALL/TERRACE spaces supporting `layout`, largest first (for overflow)."""
        pool = [
            s for s in self.spaces
            if self._bookable(s) and s["category"] in ("HALL", "TERRACE")
            and (not layout or s.get("capacities", {}).get(layout, 0) > 0)
            and s["slug"] not in exclude
        ]
        return sorted(
            pool, key=lambda s: max((s.get("capacities") or {}).values() or [0]), reverse=True
        )

    def propose_bundle(
        self, *, event_type: str, primary_slug: str, layout: str | None = None, overflow: int = 0
    ) -> list[dict[str, Any]]:
        """Complementary spaces per the matching template — CROSS-FLOOR.

        For the Pyramid, a conference plenary sits on Floor -1 while breakouts use the
        Floor-0 boxes (spec §4). When one hall can't seat everyone (`overflow` > 0), the
        next-largest bookable hall(s) are added as a multi-space plenary. Only bookable
        spaces are ever proposed; the primary is excluded.
        """
        primary = self._by_slug.get(primary_slug)
        if not primary:
            return []
        bundle: list[dict[str, Any]] = []
        used = {primary_slug}

        def add(role: str, s: dict[str, Any], reason: str) -> None:
            used.add(s["slug"])
            bundle.append({
                "role": role, "slug": s["slug"], "name": s["name"], "category": s["category"],
                "floor": s["floor"], "isCirculation": bool(s.get("isCirculation")),
                "reason": reason,
            })

        # multi-space plenary: cover the capacity shortfall with the next-largest halls (max 2)
        remaining = overflow
        for h in (self.halls_by_capacity(layout, exclude=used) if overflow > 0 else []):
            add("overflow", h, "additional capacity for the full headcount")
            remaining -= (h.get("capacities") or {}).get(layout or "", 0)
            if remaining <= 0 or sum(1 for b in bundle if b["role"] == "overflow") >= 2:
                break

        key = _TEMPLATE_FOR.get(event_type, "conference")
        template = next((t for t in self.templates if t.get("key") == key), None)
        for role in (template.get("roles", []) if template else []):
            rname = role.get("role")
            if rname in ("main", "plenary"):
                continue
            cats = role.get("category")
            cats = [cats] if isinstance(cats, str) else list(cats or [])
            cand = self._pick_role(rname, cats, primary, used)
            if cand is not None:
                add(rname, cand, role.get("note", ""))
        return bundle

    def _pick_role(
        self, role: str, cats: list[str], primary: dict[str, Any], used: set[str]
    ) -> dict[str, Any] | None:
        """Pick a BOOKABLE space for a bundle role. Breakouts/green-rooms prefer the
        Floor-0 boxes; everything else prefers adjacency, then same-floor, then any."""
        pool = [
            s for s in self.spaces
            if self._bookable(s) and s["category"] in cats and s["slug"] not in used
        ]
        if not pool:
            return None
        if role in ("breakout", "green_room"):
            # the Pyramid's breakouts are the Floor-0 boxes — prefer them, smallest first
            boxes = sorted(
                (s for s in pool if s["category"] == "BOX"),
                key=lambda s: (s["floor"] != 0, min((s.get("capacities") or {}).values() or [999])),
            )
            if boxes:
                return boxes[0]
        adj = set(primary.get("adjacent", []))
        pool.sort(key=lambda s: (s["slug"] not in adj, s["floor"] != primary["floor"]))
        return pool[0]

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
