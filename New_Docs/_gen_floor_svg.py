"""Floor-map v2 generator — trace the REAL Pyramid plans into the catalog.

Pipeline (read-only on the PDFs; idempotent):
  1. Extract the architectural linework per floor from the CAD PDFs (layer-filtered:
     exterior framework, walls, inner walls, stairs, balustrade, floor plate — drops
     the dimension/text/hatch/furniture/site noise).
  2. Normalize each floor to a 0..1000 square viewBox (PDF y is top-down, same as SVG).
  3. Build per-space hotspot polygons as annular sectors fitted to the detected radial
     centre + ring radii, using each space's curated map.{ring,sectorFrom,sectorTo}.
     A small ANGLE_OFFSET / per-space override table tunes placement onto the real wedges.
  4. Emit:
       - frontend/src/components/command/floorplan.data.ts  (backgrounds + viewBox + polys)
       - inject map.polygon into docs/03-data/spaces.catalog.json (+ the bundled AI copy)

Preview:  python New_Docs/_gen_floor_svg.py --preview   (renders New_Docs/_overview/*_v2.png)
Generate: python New_Docs/_gen_floor_svg.py            (writes the data files)

NOTE the colour-hall -> wedge mapping is unconfirmed (the CAD's C-colour layers are
empty on floor 0); sectors come from the catalog estimates + visual tuning. Logged in
.planning/ASSUMPTIONS.md.
"""
from __future__ import annotations

import json
import math
import os
import sys

import fitz

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
PLANS = {
    0: "New_Docs/kati 0- Pyramid_of_tirana_-Model.pdf",
    -1: "New_Docs/kati -1 --Pyramid_of_tirana_-Model.pdf",
    3: "New_Docs/kati 3- Pyramid_of_tirana_-Model.pdf",
}
CATALOG = "docs/03-data/spaces.catalog.json"
BUNDLED = "ai-orchestrator/app/data/spaces.catalog.json"
TS_OUT = "frontend/src/components/command/floorplan.data.ts"

VB = 1000.0      # square viewBox edge
PAD = 40.0       # padding inside the viewBox

KEEP = ["exterior framework", "walls & columns", "inner walls", "external wall",
        "stairs", "balustrade", "floor plate", "interior framework", "facade"]
DROP = ["xref", "text", " dim", "hatch", "sign", "furniture", "elevation", "axis", "guide",
        "viewport", "topograph", "tree", "shrub", "lawn", "kiosk", "illumination", "ventilation",
        "electric", "heating", "water", "sewage", "sanitary", "railway", "paving", "remark",
        "titleblock", "area ", "figures"]
STRUCT = ("exterior framework", "external wall", "walls & columns")

# Outer-band OUTER radius (fraction of the floor's median ring radius r_med) per kind.
# Angles are TILED per band (see tile_angles), so only the radial reach varies by kind:
# halls reach the octagon edge (~1.3), WCs/technical are short notches between them.
RADII = {
    "main_hall":          (0.64, 1.30),
    "annex_hall":         (0.64, 1.28),
    "perimeter_hall":     (0.64, 1.12),
    "mid_ring_hall":      (0.64, 1.02),
    "entrance_plaza":     (0.64, 1.24),
    "entrance_vestibule": (0.64, 0.92),
    "circulation":        (0.64, 0.92),
    "wc":                 (0.64, 0.88),
    "technical":          (0.64, 0.88),
}


def _keep(layer: str | None) -> bool:
    if not layer:
        return False
    low = layer.lower()
    if any(d in low for d in DROP):
        return False
    return any(k in low for k in KEEP)


def _is_struct(layer: str | None) -> bool:
    low = (layer or "").lower()
    return any(s in low for s in STRUCT)


def load_floor(path: str):
    """Return (kept_drawings, transform, radial_center, outer_radius) for a floor PDF.

    transform maps PDF points -> viewBox coords (fit-to-box, aspect-preserving, centred).
    """
    doc = fitz.open(os.path.join(ROOT, path))
    pg = doc[0]
    draws = [d for d in pg.get_drawings() if _keep(d.get("layer"))]

    xs, ys, sxs, sys = [], [], [], []
    for d in draws:
        r = d.get("rect")
        if not r or r.width > 3000 or r.height > 3000:
            continue
        xs += [r.x0, r.x1]
        ys += [r.y0, r.y1]
        if _is_struct(d.get("layer")):
            sxs += [r.x0, r.x1]
            sys += [r.y0, r.y1]
    bbox = (min(xs), min(ys), max(xs), max(ys))
    bw, bh = bbox[2] - bbox[0], bbox[3] - bbox[1]
    scale = (VB - 2 * PAD) / max(bw, bh)
    # centre the fitted bbox in the square viewBox
    ox = PAD + (VB - 2 * PAD - bw * scale) / 2
    oy = PAD + (VB - 2 * PAD - bh * scale) / 2

    def tf(p):
        return ((p[0] - bbox[0]) * scale + ox, (p[1] - bbox[1]) * scale + oy)

    # radial centre = structural envelope centre
    scx = (min(sxs) + max(sxs)) / 2 if sxs else (bbox[0] + bbox[2]) / 2
    scy = (min(sys) + max(sys)) / 2 if sys else (bbox[1] + bbox[3]) / 2
    cx, cy = tf((scx, scy))

    # Radial profile: the real outer-wall radius per 1deg bin (0deg=north, clockwise),
    # so lit wedges hug the actual silhouette and annexes/ears bulge out naturally.
    bins = [0.0] * 360
    for d in draws:
        if not _is_struct(d.get("layer")):
            continue
        for pt in _points(d, tf):
            dx, dy = pt[0] - cx, pt[1] - cy
            r = math.hypot(dx, dy)
            if r < 1:
                continue
            deg = int((math.degrees(math.atan2(dy, dx)) + 90) % 360)
            if r > bins[deg]:
                bins[deg] = r
    # fill empty bins from the nearest filled neighbour, then smooth lightly
    filled = [i for i, v in enumerate(bins) if v > 0]
    if filled:
        for i in range(360):
            if bins[i] == 0:
                j = min(filled, key=lambda k: min(abs(k - i), 360 - abs(k - i)))
                bins[i] = bins[j]
    prof = [
        (bins[(i - 1) % 360] + bins[i] + bins[(i + 1) % 360]) / 3 for i in range(360)
    ]
    r_med = sorted(prof)[len(prof) // 2]
    doc.close()
    return draws, tf, (cx, cy), prof, r_med


def _points(d, tf):
    """All vertices of a drawing, transformed to viewBox coords."""
    pts = []
    for it in d["items"]:
        op = it[0]
        try:
            if op == "l":
                pts += [tf(it[1]), tf(it[2])]
            elif op == "c":
                pts += [tf(it[1]), tf(it[4])]
            elif op == "re":
                r = it[1]
                pts += [tf((r.x0, r.y0)), tf((r.x1, r.y1))]
            elif op == "qu":
                q = it[1]
                pts += [tf((q.ul.x, q.ul.y)), tf((q.lr.x, q.lr.y))]
        except Exception:
            pass
    return pts


def path_d(draws, tf, struct: bool) -> str:
    """Merge the (structural | detail) drawings into one SVG path `d` string.

    Coords are rounded to integers and zero-length segments dropped to keep the
    emitted path compact (the viewBox is 1000 units, so 1px precision is plenty).
    """
    out = []

    def P(pt):
        return f"{round(pt[0])} {round(pt[1])}"

    for d in draws:
        if _is_struct(d.get("layer")) != struct:
            continue
        for it in d["items"]:
            op = it[0]
            try:
                if op == "l":
                    a, b = tf(it[1]), tf(it[2])
                    if round(a[0]) == round(b[0]) and round(a[1]) == round(b[1]):
                        continue
                    out.append(f"M{P(a)}L{P(b)}")
                elif op == "c":
                    a, b, c, e = tf(it[1]), tf(it[2]), tf(it[3]), tf(it[4])
                    out.append(f"M{P(a)}C{P(b)} {P(c)} {P(e)}")
                elif op == "re":
                    r = it[1]
                    p = [tf((r.x0, r.y0)), tf((r.x1, r.y0)), tf((r.x1, r.y1)), tf((r.x0, r.y1))]
                    out.append("M" + "L".join(P(x) for x in p) + "Z")
                elif op == "qu":
                    q = it[1]
                    p = [tf((pt.x, pt.y)) for pt in (q.ul, q.ur, q.lr, q.ll)]
                    out.append("M" + "L".join(P(x) for x in p) + "Z")
            except Exception:
                pass
    return "".join(out)


def _pt(center, r, deg):
    cx, cy = center
    a = math.radians(deg - 90)  # 0deg = north (up), clockwise
    return [round(cx + r * math.cos(a), 1), round(cy + r * math.sin(a), 1)]


def disc_polygon(center, r, steps: int = 30):
    """A disc for central cores / the summit terrace."""
    return [_pt(center, r, 360 * i / steps) for i in range(steps)]


def ring_polygon(center, r_in, r_out, steps: int = 72):
    """A full annulus for the ring concourses (all 360deg)."""
    outer = [_pt(center, r_out, 360 * i / steps) for i in range(steps + 1)]
    inner = [_pt(center, r_in, 360 - 360 * i / steps) for i in range(steps + 1)]
    return outer + inner


def band_wedge(center, a0, a1, r_in, r_out, steps: int = 16):
    """A clean annular-sector wedge spanning [a0, a1] degrees in band [r_in, r_out]."""
    def at(i):
        return a0 + (a1 - a0) * i / steps
    outer = [_pt(center, r_out, at(i)) for i in range(steps + 1)]
    inner = [_pt(center, r_in, at(steps - i)) for i in range(steps + 1)]
    return outer + inner


def tile_angles(bearings, *, gap=2.5, max_half=46, lone_half=24):
    """Partition the circle among spaces in a band so wedges TILE (never overlap):
    each space spans to the midpoint of the gap to each neighbour (clamped, minus a gap)."""
    n = len(bearings)
    if n == 1:
        return [(bearings[0] - lone_half, bearings[0] + lone_half)]
    order = sorted(range(n), key=lambda i: bearings[i])
    out = [None] * n
    for k, i in enumerate(order):
        b = bearings[i]
        prev_b = bearings[order[(k - 1) % n]]
        next_b = bearings[order[(k + 1) % n]]
        left = min(((b - prev_b) % 360) / 2, max_half)
        right = min(((next_b - b) % 360) / 2, max_half)
        out[i] = (b - left + gap, b + right - gap)
    return out


def floor_polygons(floor_spaces, center, r_med):
    """All hotspot polygons for one floor, laid out in non-overlapping radial bands and
    angularly TILED within each band. Layering: core boxes < inner ring < box ring <
    outer ring < outer wedges (halls/WC/technical), with full-ring concourses between."""
    out = {}
    bands = {"core": [], "box": [], "rim": [], "outer": []}
    for s in floor_spaces:
        m = s.get("map") or {}
        kind = m.get("spaceKind", "mid_ring_hall")
        slug = s["slug"]
        if kind == "circulation" and slug.startswith("ring_"):  # concourse -> full annulus
            out[slug] = (ring_polygon(center, r_med * 0.36, r_med * 0.43) if "inner" in slug
                         else ring_polygon(center, r_med * 0.57, r_med * 0.63))
        elif kind == "outdoor_stairs":  # the monumental stair fan (fixed wide, not tiled)
            b = m.get("bearing", 180)
            out[slug] = band_wedge(center, b - 96, b + 96, r_med * 0.50, r_med * 1.28, steps=44)
        elif kind == "outdoor_terrace":  # summit -> centre disc
            out[slug] = disc_polygon(center, r_med * 0.22)
        elif kind == "circulation_feature":
            bands["core"].append(s)
        elif kind == "box":
            bands["box"].append(s)
        elif kind == "rim_room":
            bands["rim"].append(s)
        else:  # halls, WC, technical, entrance_*, foyer circulation
            bands["outer"].append(s)

    def place(items, r_in_f, r_out_f, **kw):
        if not items:
            return
        angs = tile_angles([s["map"]["bearing"] for s in items], **kw)
        for s, (a0, a1) in zip(items, angs):
            ro = RADII.get(s["map"].get("spaceKind"), (r_in_f, r_out_f))[1] if r_out_f is None else r_out_f
            out[s["slug"]] = band_wedge(center, a0, a1, r_med * r_in_f, r_med * ro)

    core = bands["core"]
    if len(core) == 1:  # a single central hall -> a disc
        out[core[0]["slug"]] = disc_polygon(center, r_med * 0.26)
    else:
        place(core, 0.06, 0.34, lone_half=40)
    place(bands["box"], 0.44, 0.56)
    place(bands["rim"], 0.30, 0.52, lone_half=20)
    place(bands["outer"], 0.64, None)  # per-kind outer radius via RADII
    return out


def build():
    catalog = json.load(open(os.path.join(ROOT, CATALOG), encoding="utf-8"))
    spaces = catalog["spaces"]
    floors = {}
    polys_by_slug = {}
    for floor, path in PLANS.items():
        draws, tf, center, prof, r_med = load_floor(path)
        floors[floor] = {
            "viewBox": f"0 0 {int(VB)} {int(VB)}",
            "structural": path_d(draws, tf, True),
            "detail": path_d(draws, tf, False),
        }
        floor_spaces = [s for s in spaces if s["floor"] == floor and s.get("map")]
        polys_by_slug.update(floor_polygons(floor_spaces, center, r_med))
        print(f"floor {floor}: center=({center[0]:.0f},{center[1]:.0f}) r_med={r_med:.0f} "
              f"struct={len(floors[floor]['structural'])}B detail={len(floors[floor]['detail'])}B")
    return catalog, floors, polys_by_slug


def preview(catalog, floors, polys_by_slug):
    os.makedirs(os.path.join(ROOT, "New_Docs/_overview"), exist_ok=True)
    by_slug = {s["slug"]: s for s in catalog["spaces"]}
    for floor, fd in floors.items():
        polys = [(slug, p) for slug, p in polys_by_slug.items()
                 if by_slug[slug]["floor"] == floor]
        shapes = []
        for slug, p in polys:
            pts = " ".join(f"{x},{y}" for x, y in p)
            shapes.append(
                f'<polygon points="{pts}" fill="#2F6FED" fill-opacity="0.28" '
                f'stroke="#2F6FED" stroke-width="2"/>'
            )
            cx = sum(x for x, _ in p) / len(p)
            cy = sum(y for _, y in p) / len(p)
            shapes.append(
                f'<text x="{cx:.0f}" y="{cy:.0f}" font-size="13" fill="#11203A" '
                f'text-anchor="middle">{slug}</text>'
            )
        svg = (
            f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="{fd["viewBox"]}" '
            f'width="{int(VB)}" height="{int(VB)}">'
            f'<rect width="{int(VB)}" height="{int(VB)}" fill="white"/>'
            f'<path d="{fd["detail"]}" fill="none" stroke="#9AA3B2" stroke-width="0.8"/>'
            f'<path d="{fd["structural"]}" fill="none" stroke="#1A2433" stroke-width="1.6"/>'
            f'{"".join(shapes)}</svg>'
        )
        out = os.path.join(ROOT, f"New_Docs/_overview/f{floor}_v2.png")
        svg_doc = fitz.open(stream=svg.encode(), filetype="svg")
        pdf = fitz.open(stream=svg_doc.convert_to_pdf(), filetype="pdf")
        pdf[0].get_pixmap().save(out)
        print("preview ->", out, f"({len(polys)} polys)")


def write_outputs(catalog, floors, polys_by_slug):
    for s in catalog["spaces"]:
        if s["slug"] in polys_by_slug:
            s.setdefault("map", {})["polygon"] = polys_by_slug[s["slug"]]
    for rel in (CATALOG, BUNDLED):
        with open(os.path.join(ROOT, rel), "w", encoding="utf-8") as f:
            json.dump(catalog, f, indent=2, ensure_ascii=False)
        print("wrote", rel)
    # frontend background data module
    floors_ts = ",\n".join(
        f'  "{fl}": {{ viewBox: "{fd["viewBox"]}", '
        f'structural: {json.dumps(fd["structural"])}, detail: {json.dumps(fd["detail"])} }}'
        for fl, fd in floors.items()
    )
    ts = (
        "// AUTO-GENERATED by New_Docs/_gen_floor_svg.py — do not edit by hand.\n"
        "// Real Pyramid floor-plan linework (layer-filtered from the CAD), normalized to a\n"
        "// 0..1000 viewBox per floor. Consumed by FloorMap.tsx (real-plan mode).\n"
        "export interface FloorPlan { viewBox: string; structural: string; detail: string }\n"
        "export const FLOOR_PLANS: Record<string, FloorPlan> = {\n"
        f"{floors_ts}\n}}\n"
    )
    path = os.path.join(ROOT, TS_OUT)
    if os.path.isdir(os.path.dirname(path)):
        with open(path, "w", encoding="utf-8") as f:
            f.write(ts)
        print("wrote", TS_OUT, f"({len(ts)} bytes)")
    else:
        print("SKIP", TS_OUT, "(frontend dir missing)")


if __name__ == "__main__":
    catalog, floors, polys_by_slug = build()
    if "--preview" in sys.argv:
        preview(catalog, floors, polys_by_slug)
    else:
        write_outputs(catalog, floors, polys_by_slug)
