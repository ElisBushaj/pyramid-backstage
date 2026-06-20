"""Venue tests — lock the real-floor-model behaviour the spec requires.

Covers the non-negotiables of §4: capacity-for-setup is computed (not hardcoded),
non-bookable spaces (wc/technical/circulation) are NEVER proposed, conference
breakouts use the Floor-0 boxes (cross-floor), and big events fan out to overflow
halls. All offline against the bundled catalog.
"""

from __future__ import annotations

from app.venue import capacity_for, get_venue


def test_capacity_for_computes_from_density() -> None:
    assert capacity_for(160, "THEATER") == 106   # floor(160 / 1.5)
    assert capacity_for(60, "BOARDROOM") == 20    # floor(60 / 3.0)
    assert capacity_for(None, "THEATER") is None
    assert capacity_for(50, "NOT_A_SETUP") is None


def test_catalog_has_the_real_model() -> None:
    v = get_venue()
    assert len(v.spaces) >= 50
    # the main hall (planted-conflict UUID ...001) is bookable + carries the real fields
    main = v.by_name("Space 1 — Main hall")
    assert main and main["id"].endswith("000000000001")
    assert main["map"]["bookable"] is True
    assert main["map"]["spaceKind"] == "main_hall"


def test_non_bookable_never_bundled() -> None:
    v = get_venue()
    bundle = v.propose_bundle(event_type="CONFERENCE", primary_slug="m1_space_1", layout="THEATER")
    assert bundle, "a conference should propose complementary spaces"
    for b in bundle:
        space = v.by_slug(b["slug"])
        assert space and space["map"]["bookable"] is True, f"{b['slug']} is not bookable"


def test_conference_breakout_uses_a_floor0_box() -> None:
    v = get_venue()
    bundle = v.propose_bundle(event_type="CONFERENCE", primary_slug="m1_space_1", layout="THEATER")
    breakout = next((b for b in bundle if b["role"] == "breakout"), None)
    assert breakout is not None
    # cross-floor: plenary on -1, breakout in a Floor-0 box
    assert breakout["category"] == "BOX" and breakout["floor"] == 0


def test_overflow_fans_out_to_more_halls() -> None:
    v = get_venue()
    bundle = v.propose_bundle(
        event_type="CONFERENCE", primary_slug="m1_space_1", layout="THEATER", overflow=80
    )
    overflow = [b for b in bundle if b["role"] == "overflow"]
    assert overflow, "a capacity shortfall must add overflow halls"
    assert all(v.by_slug(b["slug"])["category"] in ("HALL", "TERRACE") for b in overflow)


def test_halls_by_capacity_excludes_non_bookable() -> None:
    v = get_venue()
    halls = v.halls_by_capacity("THEATER")
    assert halls and all(h["map"]["bookable"] is True for h in halls)
    # sorted largest-first
    caps = [max(h["capacities"].values()) for h in halls]
    assert caps == sorted(caps, reverse=True)
