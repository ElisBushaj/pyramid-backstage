"""Generate docs/03-data/spaces.catalog.json from the REAL floor spec (JunctionX 2026).

The catalog is the single shared source: ops-core seeds Space records from it, the AI
grounds matching/venue_facts on it, and the floor-map renders it. This generator encodes
the architect-derived model for Floors 0 / -1 / 3 (radial, 16 axes, north at top, axis
1/1a = bottom = main entrance; `bearing` = compass degrees, 0 = top/N, clockwise).

Pipeline: run this FIRST (writes the base catalog), THEN `_gen_floor_svg.py` (reads it,
injects `map.polygon` per space + writes the frontend backgrounds + the bundled AI copy).

Caveats baked into the data: ceiling heights + levels are read from the plans (reliable);
AREAS and CAPACITIES are estimated at an inferred 1:200 scale (+/-20%) and are EDITABLE.
Capacities are COMPUTED from area via the density table (not hand-tuned).
Colour halls (Blue/Orange/Green/Yellow) are NOT hardcoded — staff assign them later.
"""
import json
import math
import os

# ── UUID scheme — preserve the 6 authoritative ops-core seed ids; everything else >= 20.
# The seed's planted demo (E1/E3 conflict, E2) references ...001 + ...003, so those MUST
# stay valid bookable halls. We remap them onto the real Floor -1 halls.
LEGACY = {
    "M1-SPACE-1": 1,   # -> ...001  (was "Blue Hall"; now the main hall — planted conflict lands here)
    "M1-SPACE-10": 2,  # -> ...002  (was "Orange Hall")
    "M1-SPACE-13": 3,  # -> ...003  (was "Green Hall"; holds seed event E2)
    "M1-SPACE-9": 4,   # -> ...004  (was "Yellow Hall")
    "BOX-5": 5,        # -> ...005  (registration box near the north entrance)
    "RING-OUTER-M1": 6,  # -> ...006 (outer concourse)
}
_next = [20]


def uid_for(spec_id):
    n = LEGACY.get(spec_id)
    if n is None:
        n = _next[0]
        _next[0] += 1
    return f"50000000-0000-4000-8000-{n:012d}"


def slugify(spec_id):
    return spec_id.lower().replace("-", "_").replace(".", "_")


# ── Capacity model (compute, don't hardcode): floor(area / density). ──────────────────
DENSITY = {"RECEPTION": 0.8, "THEATER": 1.5, "CLASSROOM": 2.0, "BANQUET": 1.8, "BOARDROOM": 3.0, "CABARET": 2.2}
LAYOUTS = {
    "main_hall": ["THEATER", "CLASSROOM", "BANQUET", "RECEPTION", "CABARET"],
    "annex_hall": ["THEATER", "CLASSROOM", "BANQUET", "RECEPTION"],
    "perimeter_hall": ["THEATER", "CLASSROOM", "BANQUET", "RECEPTION"],
    "mid_ring_hall": ["RECEPTION", "CABARET", "CLASSROOM"],
    "box": ["BOARDROOM", "CLASSROOM"],
    "rim_room": ["BOARDROOM", "CLASSROOM"],
    "outdoor_terrace": ["RECEPTION", "CABARET"],
    "outdoor_stairs": ["RECEPTION"],
}
OUTDOOR = {"outdoor_terrace", "outdoor_stairs"}


def capacities(kind, area):
    if not area or kind not in LAYOUTS:
        return {}
    safety = 0.6 if kind in OUTDOOR else 1.0  # outdoor = safety-capped, not pure area
    return {L: max(1, int(area / DENSITY[L] * safety)) for L in LAYOUTS[kind]}


# ── ops-core derived fields ───────────────────────────────────────────────────────────
CATEGORY = {
    "main_hall": "HALL", "annex_hall": "HALL", "perimeter_hall": "HALL", "mid_ring_hall": "HALL",
    "box": "BOX", "rim_room": "BOX",
    "outdoor_terrace": "TERRACE", "outdoor_stairs": "TERRACE",
    "circulation": "CORRIDOR", "circulation_feature": "ATRIUM",
    "entrance_plaza": "ENTRANCE", "entrance_vestibule": "ENTRANCE",
    "wc": "TRANSITIONAL", "technical": "TRANSITIONAL",
}
MAIN_KINDS = {"main_hall", "annex_hall", "perimeter_hall", "mid_ring_hall", "box", "rim_room", "outdoor_terrace"}
CIRC_KINDS = {"circulation", "circulation_feature", "entrance_plaza", "entrance_vestibule"}
RATE = {"main_hall": 90000, "annex_hall": 60000, "perimeter_hall": 48000, "mid_ring_hall": 28000,
        "box": 16000, "rim_room": 24000, "outdoor_terrace": 85000, "outdoor_stairs": 120000}
BUFFERS = {"main_hall": (240, 120), "annex_hall": (180, 90), "perimeter_hall": (150, 90),
           "mid_ring_hall": (120, 60), "box": (60, 60), "rim_room": (60, 60),
           "outdoor_terrace": (180, 120), "outdoor_stairs": (180, 120)}


def compass(bearing):
    dirs = ["N", "NE", "E", "SE", "S", "SW", "W", "NW"]
    return dirs[int(((bearing % 360) + 22.5) // 45) % 8]


def features(kind, ceiling, near_entrance, outdoor, summit):
    f = []
    if kind == "main_hall":
        f += ["stage", "av_builtin", "step_free"]
    elif kind == "annex_hall":
        f += ["av_builtin", "step_free"]
    elif kind in ("perimeter_hall", "mid_ring_hall"):
        f += ["step_free"]
    elif kind == "box":
        f += ["enclosed"]
    elif kind == "rim_room":
        f += ["enclosed", "panoramic_view"]
    elif kind == "wc":
        f += ["restroom"]
    elif kind == "technical":
        f += ["plant"]
    elif kind in CIRC_KINDS:
        f += ["circulation"]
    if outdoor:
        f += ["outdoor", "weather_dependent"]
        f += ["iconic", "panoramic_view"] if summit else ["crowd_managed"]
    if ceiling is not None:
        if ceiling >= 3.3:
            f.append("av_rigging")
        elif ceiling < 2.6:
            f.append("low_ceiling")
    if near_entrance:
        f.append("near_entrance")
    return f


def build_space(s):
    kind = s["kind"]
    area = s.get("area")
    ceiling = s.get("ceiling")
    outdoor = bool(s.get("outdoor"))
    summit = s.get("id") == "F3-SUMMIT"
    sb, tb = BUFFERS.get(kind, (60, 30))
    bookable = s.get("bookable", False)
    level = s.get("level")
    level_range = s.get("levelRange")
    if level is None and level_range:
        level = level_range[0]
    o = {
        "id": uid_for(s["id"]),
        "slug": slugify(s["id"]),
        "name": s["name"],
        "floor": s["floor"],
        "kind": "MAIN" if kind in MAIN_KINDS and bookable else "TRANSITIONAL",
        "category": CATEGORY.get(kind, "TRANSITIONAL"),
        "zone": f"F{s['floor']}-{compass(s['bearing'])}",
        "isCirculation": kind in CIRC_KINDS,
        "capacities": capacities(kind, area) if bookable else {},
        "features": features(kind, ceiling, s.get("nearEntrance"), outdoor, summit),
        "dayRateMinor": RATE.get(kind, 0) if bookable else 0,
        "currency": "ALL",
        "setupBufferMinutes": sb,
        "teardownBufferMinutes": tb,
        "status": "ACTIVE",
        "adjacent": [slugify(n) for n in s.get("neighbors", [])],
        # `map` carries BOTH the legacy radial fields (v1 fallback) and the real-plan fields
        # (bearing/level/area/bookable/spaceKind) consumed by FloorMap v2 + the AI.
        "map": {
            "floor": s["floor"],
            "bearing": s["bearing"],
            "ring": s.get("ring", "outer"),
            "spaceKind": kind,
            "bookable": bookable,
            "areaApproxM2": area,
            "areaEstimated": True,
            "level": level,
        },
    }
    if ceiling is not None:
        o["ceilingCm"] = round(ceiling * 100)
        o["map"]["ceilingMeters"] = ceiling
    if level_range:
        o["map"]["levelRange"] = level_range
    for k in ("stepped", "outdoor", "weatherDependent", "nearEntrance", "note", "idsToConfirm"):
        if s.get(k):
            o["map"][k] = s[k]
    return o


# ══ THE REAL SPACE MODEL — transcribed from the floor spec (areas/caps estimated ±20%) ══
# ring is a legacy hint for the v1 radial fallback: center | corridor | outer.
FLOOR0 = [
    {"id": "BOX-1.4", "name": "Central hall (grand stair atrium)", "floor": 0, "bearing": 0, "kind": "circulation_feature", "bookable": False, "level": 0.0, "ceiling": 2.55, "area": 120, "ring": "center", "note": "Central core of radiating stair flights + planters."},
    {"id": "RING-INNER-0", "name": "Inner concourse", "floor": 0, "bearing": 0, "kind": "circulation", "bookable": False, "level": 0.0, "ring": "corridor", "note": "Inner ring corridor wrapping the central stair hall."},
    {"id": "RING-OUTER-0", "name": "Outer concourse", "floor": 0, "bearing": 0, "kind": "circulation", "bookable": False, "level": 0.0, "ring": "corridor", "note": "Outer ring corridor; box + wedge-space doors open here."},
    {"id": "BOX-2", "name": "Box 2", "floor": 0, "bearing": 243, "kind": "box", "bookable": True, "level": 0.30, "ceiling": 2.90, "area": 55, "neighbors": ["BOX-3"], "nearEntrance": "ENT-S", "ring": "boxRing"},
    {"id": "BOX-3", "name": "Box 3", "floor": 0, "bearing": 278, "kind": "box", "bookable": True, "level": 0.30, "ceiling": 3.38, "area": 50, "neighbors": ["BOX-2", "BOX-4"], "ring": "boxRing", "note": "Tallest ceiling (3.38 m) — best for tall installations / AV trussing."},
    {"id": "BOX-4", "name": "Box 4", "floor": 0, "bearing": 308, "kind": "box", "bookable": True, "level": 0.75, "ceiling": 2.58, "area": 55, "neighbors": ["BOX-3", "BOX-5"], "ring": "boxRing"},
    {"id": "BOX-5", "name": "Box 5", "floor": 0, "bearing": 2, "kind": "box", "bookable": True, "level": 0.75, "ceiling": 2.70, "area": 60, "neighbors": ["BOX-4", "BOX-6"], "nearEntrance": "ENT-N", "ring": "boxRing", "note": "Widest box; near North entrance — registration / welcome / main breakout."},
    {"id": "BOX-6", "name": "Box 6", "floor": 0, "bearing": 55, "kind": "box", "bookable": True, "level": 1.20, "ceiling": 2.70, "area": 55, "neighbors": ["BOX-5", "BOX-7"], "ring": "boxRing"},
    {"id": "BOX-7", "name": "Box 7", "floor": 0, "bearing": 82, "kind": "box", "bookable": True, "level": 1.20, "ceiling": 2.70, "area": 40, "neighbors": ["BOX-6", "BOX-8"], "ring": "boxRing", "note": "Smallest / narrow — workshop or green room."},
    {"id": "BOX-8", "name": "Box 8", "floor": 0, "bearing": 111, "kind": "box", "bookable": True, "level": 1.20, "ceiling": 2.98, "area": 50, "neighbors": ["BOX-7", "BOX-9"], "ring": "boxRing"},
    {"id": "BOX-9", "name": "Box 9", "floor": 0, "bearing": 121, "kind": "box", "bookable": True, "level": 1.20, "ceiling": 2.98, "area": 50, "neighbors": ["BOX-8"], "nearEntrance": "ENT-S", "ring": "boxRing"},
    {"id": "SPACE-21", "name": "Space 21 — Entrance plaza", "floor": 0, "bearing": 180, "kind": "entrance_plaza", "bookable": False, "levelRange": [-4.65, 0.0], "stepped": True, "ring": "outer", "note": "Main south entrance: a wide stepped plaza descending toward Floor -1."},
    # Outer wedge terraces, NUMBERED SEQUENTIALLY CLOCKWISE from the south entrance:
    # 21(S) → 22 → 23 → 24 → 25 → 26 → 27 → 28 → 29 → 30(E). No two overlap.
    {"id": "SPACE-22", "name": "Space 22 — SW terrace", "floor": 0, "bearing": 214, "kind": "mid_ring_hall", "bookable": True, "level": 0.30, "area": 50, "ring": "outer", "note": "Wedge terrace / informal gathering & overflow."},
    {"id": "SPACE-23", "name": "Space 23 — West terrace", "floor": 0, "bearing": 246, "kind": "mid_ring_hall", "bookable": True, "level": 0.30, "area": 50, "ring": "outer", "note": "Wedge terrace near the West annex link; gathering / catering overflow."},
    {"id": "SPACE-24", "name": "Space 24 — perimeter terrace", "floor": 0, "bearing": 278, "kind": "mid_ring_hall", "bookable": True, "level": 0.75, "area": 50, "ring": "outer", "idsToConfirm": True},
    {"id": "SPACE-25", "name": "Space 25 — perimeter terrace", "floor": 0, "bearing": 308, "kind": "mid_ring_hall", "bookable": True, "level": 0.75, "area": 50, "ring": "outer", "idsToConfirm": True},
    {"id": "SPACE-26", "name": "Space 26 — perimeter terrace", "floor": 0, "bearing": 336, "kind": "mid_ring_hall", "bookable": True, "level": 0.75, "area": 50, "ring": "outer", "idsToConfirm": True},
    {"id": "SPACE-27", "name": "Space 27 — perimeter terrace", "floor": 0, "bearing": 4, "kind": "mid_ring_hall", "bookable": True, "level": 0.75, "area": 50, "ring": "outer", "idsToConfirm": True},
    {"id": "SPACE-28", "name": "Space 28 — perimeter terrace", "floor": 0, "bearing": 30, "kind": "mid_ring_hall", "bookable": True, "level": 0.75, "area": 50, "ring": "outer", "idsToConfirm": True},
    {"id": "SPACE-29", "name": "Space 29 — NE terrace", "floor": 0, "bearing": 58, "kind": "mid_ring_hall", "bookable": True, "level": 0.50, "area": 45, "ring": "outer"},
    {"id": "SPACE-30", "name": "Space 30 — East terrace (stepped)", "floor": 0, "bearing": 92, "kind": "mid_ring_hall", "bookable": True, "levelRange": [0.18, 2.16], "stepped": True, "area": 80, "ring": "outer", "note": "Large east wedge with its own stairs, multi-level. Good for staged / standing receptions."},
    {"id": "ENT-N", "name": "North entrance + service", "floor": 0, "bearing": 0, "kind": "entrance_vestibule", "bookable": False, "level": 0.60, "ring": "outer", "note": "Secondary entry (axes 15-16) with a stair up + an adjacent WC / service room."},
]

FLOORM1 = [
    # The 3 central grand-stair-hall boxes, in their real quadrants (1.2 NW, 1.3 NE,
    # 1.1 SW) around the core, with the central stair (Space 17) at the SE.
    {"id": "BOX-1.1", "name": "Box 1.1", "floor": -1, "bearing": 225, "kind": "circulation_feature", "bookable": False, "level": -4.65, "ceiling": 2.90, "ring": "center", "note": "Lower segment of the central grand-stair hall."},
    {"id": "BOX-1.2", "name": "Box 1.2", "floor": -1, "bearing": 315, "kind": "circulation_feature", "bookable": False, "level": -4.65, "ceiling": 3.00, "ring": "center", "note": "Central stair-hall segment; stairs up to Floor 0."},
    {"id": "BOX-1.3", "name": "Box 1.3", "floor": -1, "bearing": 45, "kind": "circulation_feature", "bookable": False, "level": -4.65, "ceiling": 3.00, "ring": "center", "note": "Central stair-hall segment."},
    {"id": "M1-BOX-1", "name": "Box 1", "floor": -1, "bearing": 0, "kind": "box", "bookable": True, "level": -4.65, "ceiling": 2.70, "area": 45, "ring": "outer", "note": "North enclosed room on the mid-ring (mirrors Box 5 above). Meeting / breakout."},
    {"id": "RING-INNER-M1", "name": "Inner concourse (-1)", "floor": -1, "bearing": 0, "kind": "circulation", "bookable": False, "level": -4.65, "ring": "corridor"},
    {"id": "RING-OUTER-M1", "name": "Outer concourse (-1)", "floor": -1, "bearing": 0, "kind": "circulation", "bookable": False, "level": -4.65, "ring": "corridor"},
    {"id": "M1-SPACE-1", "name": "Space 1 — Main hall", "floor": -1, "bearing": 180, "kind": "main_hall", "bookable": True, "level": -4.65, "area": 160, "ring": "outer", "likelyColourHall": True, "note": "Largest hall, south side, directly below the Floor-0 entrance plaza. Primary plenary venue."},
    {"id": "M1-SPACE-13", "name": "Space 13 — East annex hall", "floor": -1, "bearing": 90, "kind": "annex_hall", "bookable": True, "level": -4.65, "area": 85, "ring": "outer", "likelyColourHall": True, "note": "Large enclosed room in the east octagon corner. Secondary hall / exhibition."},
    {"id": "M1-SPACE-10", "name": "Space 10 — West annex hall", "floor": -1, "bearing": 270, "kind": "annex_hall", "bookable": True, "level": -4.65, "area": 85, "ring": "outer", "likelyColourHall": True, "note": "Large enclosed room in the west octagon corner; has a small internal WC."},
    {"id": "M1-SPACE-9", "name": "Space 9 — NE hall", "floor": -1, "bearing": 35, "kind": "perimeter_hall", "bookable": True, "level": -4.65, "area": 65, "ring": "outer", "likelyColourHall": True},
    {"id": "M1-SPACE-8", "name": "Space 8 — North entrance vestibule", "floor": -1, "bearing": 20, "kind": "entrance_vestibule", "bookable": False, "levelRange": [-4.77, -1.50], "ring": "outer", "note": "North arrival vestibule; stairs up toward the Floor-0 north entrance."},
    {"id": "M1-SPACE-4", "name": "Space 4 — mid-ring foyer", "floor": -1, "bearing": 250, "kind": "mid_ring_hall", "bookable": True, "level": -4.65, "area": 60, "ring": "outer"},
    {"id": "M1-SPACE-5", "name": "Space 5 — mid-ring foyer", "floor": -1, "bearing": 285, "kind": "mid_ring_hall", "bookable": True, "level": -4.65, "area": 55, "ring": "outer"},
    {"id": "M1-SPACE-11", "name": "Space 11 — mid-ring foyer", "floor": -1, "bearing": 45, "kind": "mid_ring_hall", "bookable": True, "level": -4.65, "area": 55, "ring": "outer"},
    {"id": "M1-SPACE-12", "name": "Space 12 — mid-ring foyer", "floor": -1, "bearing": 65, "kind": "mid_ring_hall", "bookable": True, "level": -4.65, "area": 55, "ring": "outer"},
    {"id": "M1-SPACE-14", "name": "Space 14 — mid-ring foyer", "floor": -1, "bearing": 130, "kind": "mid_ring_hall", "bookable": True, "level": -4.65, "area": 60, "ring": "outer"},
    {"id": "M1-SPACE-17", "name": "Space 17 — central stair", "floor": -1, "bearing": 135, "kind": "circulation_feature", "bookable": False, "level": -4.65, "ring": "center", "note": "Central grand stair (SE quadrant of the core)."},
    {"id": "M1-SPACE-2", "name": "Space 2 — WC", "floor": -1, "bearing": 205, "kind": "wc", "bookable": False, "level": -4.65, "area": 35, "ring": "outer"},
    {"id": "M1-SPACE-3", "name": "Space 3 — WC", "floor": -1, "bearing": 218, "kind": "wc", "bookable": False, "level": -4.65, "area": 30, "ring": "outer"},
    {"id": "M1-SPACE-7", "name": "Space 7 — WC", "floor": -1, "bearing": 0, "kind": "wc", "bookable": False, "level": -4.65, "area": 35, "ring": "outer"},
    {"id": "M1-SPACE-16", "name": "Space 16 — WC", "floor": -1, "bearing": 150, "kind": "wc", "bookable": False, "level": -4.65, "area": 35, "ring": "outer"},
    {"id": "M1-ELEC", "name": "Electric Room", "floor": -1, "bearing": 300, "kind": "technical", "bookable": False, "level": -4.65, "area": 25, "ring": "outer"},
    {"id": "M1-SPACE-6", "name": "Space 6 — Pumproom", "floor": -1, "bearing": 330, "kind": "technical", "bookable": False, "level": -4.65, "area": 25, "ring": "outer"},
]

FLOOR3 = [
    {"id": "F3-SUMMIT", "name": "Summit terrace", "floor": 3, "bearing": 0, "kind": "outdoor_terrace", "bookable": True, "levelRange": [12.80, 13.92], "area": 120, "outdoor": True, "weatherDependent": True, "ring": "center", "note": "Central rooftop platform at the apex. Premium outdoor reception / launch space; capacity safety-limited."},
    {"id": "F3-STAIRS", "name": "Grand external stairs", "floor": 3, "bearing": 180, "kind": "outdoor_stairs", "bookable": "conditional", "levelRange": [0.0, 14.10], "outdoor": True, "weatherDependent": True, "ring": "outer", "note": "Monumental climbable staircase (~270 deg). Iconic outdoor amphitheatre — bookable only as a managed, crowd-controlled surface."},
    # Upper rim rooms (per the plan): S52 left, Box 16 centre (a bit up), S54 centre
    # (a bit down, above the summit), S53 right. (Spaces 50/51 do not exist.)
    {"id": "F3-SPACE-52", "name": "Space 52 — upper-rim room", "floor": 3, "bearing": 302, "kind": "rim_room", "bookable": True, "level": 13.20, "area": 40, "ring": "rimRooms"},
    {"id": "F3-BOX-16", "name": "Box 16", "floor": 3, "bearing": 350, "kind": "rim_room", "bookable": True, "level": 14.64, "ceiling": 2.70, "area": 45, "ring": "rimRooms", "note": "Enclosed room at the top (north). Small VIP / lookout / meeting room."},
    {"id": "F3-SPACE-54", "name": "Space 54 — upper-rim room", "floor": 3, "bearing": 14, "kind": "rim_room", "bookable": True, "level": 13.20, "area": 40, "ring": "rimRooms"},
    {"id": "F3-SPACE-53", "name": "Space 53 — upper-rim room", "floor": 3, "bearing": 60, "kind": "rim_room", "bookable": True, "level": 13.20, "area": 40, "ring": "rimRooms"},
]

ALL = FLOOR0 + FLOORM1 + FLOOR3
spaces = [build_space(s) for s in ALL]

catalog = {
    "$meta": {
        "title": "Pyramid of Tirana -- space catalog (real floor model)",
        "purpose": "Single shared source for the venue's spaces. Feeds ops-core Space seed, the AI matcher/venue_facts, and the floor-map UI.",
        "source": "Architect-derived floor spec (Floors 0 / -1 / 3) from the CAD plans. Radial building, 16 axes, north at top, axis 1/1a = bottom = main entrance.",
        "conventions": {
            "geometry": "radial; map.bearing = compass deg (0=top/N, clockwise); map.level = finished-floor height in m vs the Floor-0 datum (+0.00).",
            "kind": ["MAIN", "TRANSITIONAL"],
            "map.spaceKind": ["main_hall", "annex_hall", "perimeter_hall", "mid_ring_hall", "box", "rim_room", "outdoor_terrace", "outdoor_stairs", "circulation", "circulation_feature", "entrance_plaza", "entrance_vestibule", "wc", "technical"],
            "map.bookable": "true | false | 'conditional' — HARD FILTER. The matcher must never return wc/technical/circulation/entrance_vestibule; 'conditional' (external stairs) is outdoor-only with crowd/weather handling.",
            "capacities": "COMPUTED floor(areaApproxM2 / density) per layout; outdoor safety-capped (x0.6). Density m2/pax: standing/RECEPTION .8, THEATER 1.5, CLASSROOM 2.0, BANQUET 1.8, BOARDROOM 3.0, CABARET 2.2.",
            "map.areaEstimated": "true = area/capacities are ~1:200-scale estimates (+/-20%); render with an 'estimated' affordance + allow edit.",
        },
        "caveats": "Ceiling heights + levels are read from the plans (reliable). AREAS + CAPACITIES are estimated (+/-20%) and editable. Colour halls (Blue/Orange/Green/Yellow) live on Floor -1, are NOT hardcoded — staff assign via brandColor later; M1-SPACE-1/10/13/9 flagged as likely candidates. Floors 1 & 2 not yet provided (central stairs imply them) — clean extension points. Some space ids (24-28, 50-54) are to-confirm.",
        "counts": {},
    },
    "spaces": spaces,
    # Multi-floor bundles: the brief's "events spill into the entrance, corridors, transitional
    # and informal spaces". Plenary on -1, breakouts in Floor-0 boxes, registration at the entrance.
    "bundleTemplates": [
        {"key": "conference", "when": "eventType=CONFERENCE", "roles": [
            {"role": "plenary", "category": "HALL", "layout": "THEATER", "note": "main talks"},
            {"role": "breakout", "category": "BOX", "note": "parallel sessions / workshops", "optional": True},
            {"role": "registration", "category": ["ENTRANCE", "HALL"], "note": "check-in + coffee near the entrance", "optional": True},
            {"role": "green_room", "category": "BOX", "note": "speakers / staff", "optional": True}]},
        {"key": "exhibition", "when": "eventType=EXHIBITION", "roles": [
            {"role": "main", "category": "HALL", "layout": "RECEPTION", "note": "booths"},
            {"role": "overflow", "category": "HALL", "note": "extra booths / flow", "optional": True}]},
        {"key": "gala", "when": "eventType in (COMMUNITY,PRIVATE,PERFORMANCE)", "roles": [
            {"role": "main", "category": "HALL", "layout": "BANQUET", "note": "dinner"},
            {"role": "welcome", "category": ["TERRACE", "HALL"], "layout": "RECEPTION", "note": "welcome drinks / summit views", "optional": True}]},
    ],
    "circulationRules": [
        "Never offer wc / technical / circulation / entrance_vestibule as an event venue (map.bookable=false).",
        "'conditional' spaces (external stairs) appear only for matching outdoor event types with crowd-safety + weather handling.",
        "Booking an isCirculation space blocks/limits access to its neighbours during the window -- surface as an access warning.",
        "Cross-floor plans (plenary on -1 + breakouts on Floor 0) move assets via central/side stairs -- include the level moves in task lists (no lift confirmed).",
    ],
}

sp = catalog["spaces"]
catalog["$meta"]["counts"] = {
    "total": len(sp),
    "bookable": sum(1 for s in sp if s["map"].get("bookable") is True),
    "by_floor": {str(f): sum(1 for s in sp if s["floor"] == f) for f in sorted({s["floor"] for s in sp})},
    "by_category": {c: sum(1 for s in sp if s["category"] == c) for c in sorted({s["category"] for s in sp})},
}

path = "docs/03-data/spaces.catalog.json"
os.makedirs("docs/03-data", exist_ok=True)
with open(path, "w", encoding="utf-8") as f:
    json.dump(catalog, f, indent=2, ensure_ascii=False)

reloaded = json.load(open(path, encoding="utf-8"))
print("WROTE", path, "bytes:", os.path.getsize(path))
print("spaces:", len(reloaded["spaces"]), "| bookable:", catalog["$meta"]["counts"]["bookable"])
print("by floor:", catalog["$meta"]["counts"]["by_floor"])
print("by category:", catalog["$meta"]["counts"]["by_category"])
# integrity checks
slugs = {s["slug"] for s in sp}
dangling = sorted({a for s in sp for a in s["adjacent"] if a not in slugs})
print("dangling adjacency refs:", dangling or "none")
dupe_ids = len(sp) - len({s["id"] for s in sp})
print("duplicate uuids:", dupe_ids)
for n in (1, 3):  # the planted-conflict halls must stay bookable
    row = next(s for s in sp if s["id"] == f"50000000-0000-4000-8000-{n:012d}")
    print(f"  ...{n:03d} -> {row['name']} (bookable={row['map']['bookable']}, caps={list(row['capacities'])})")
