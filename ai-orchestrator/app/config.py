"""Application configuration via pydantic-settings.

All values load from the environment (or a local ``.env``). The single runtime
coupling to ops-core is ``OPS_CORE_URL``; flip it from the stateful mock
(``mock-ops-core`` on :4010) to the real service (:4000) to integrate — a
one-line change, no code edits. See ``docs/02-domain/AI_ORCHESTRATION.md`` →
"Parallel-dev seam".
"""

from __future__ import annotations

from functools import lru_cache

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    """Typed settings, loaded from env / ``.env``."""

    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        extra="ignore",
        case_sensitive=False,
    )

    # ── ops-core coupling (THE one seam) ────────────────────────────────────
    # Default points at the real ops-core. For isolated AI dev, set this to the
    # stateful mock, e.g. OPS_CORE_URL=http://localhost:4010/api/v1
    OPS_CORE_URL: str = "http://localhost:4000/api/v1"

    # ── F17 service-token auth to the REAL ops-core ─────────────────────────
    # Shared secret; must equal ops-core's OPS_CORE_SERVICE_TOKEN. Leave EMPTY
    # for the mock (no auth) — an empty token means NO auth headers are sent, so
    # the mock path is unchanged.
    OPS_CORE_SERVICE_TOKEN: str | None = None
    # The staff user the AI acts for (audit + partner row-scoping key). Defaults
    # to the seeded manager; ops-core clamps the role to its MANAGER ceiling.
    ACTING_USER_ID: str = "c0000000-0000-4000-8000-000000000002"
    ACTING_USER_ROLE: str = "MANAGER"

    # ── Claude / Anthropic (optional in scaffold — the graph nodes are stubs) ─
    # When Alvin wires the graph, the SDK reads this. Model id is the exact
    # string `claude-opus-4-8` (Anthropic's most capable Opus-tier model).
    ANTHROPIC_API_KEY: str | None = None
    MODEL: str = "claude-opus-4-8"
    # Faster model for the structured / low-stakes calls (NL intake parse + chat
    # question phrasing). Sonnet is plenty for extraction and far snappier than Opus
    # for these — keeps the copilot responsive on stage.
    FAST_MODEL: str = "claude-sonnet-4-6"

    # ── Conversation state (Redis) + RAG (ChromaDB) ─────────────────────────
    REDIS_URL: str = "redis://localhost:6379/0"
    CHROMA_URL: str = "http://localhost:8001"

    # ── Venue knowledge (the space catalog the AI reasons over) ──────────────
    # Defaults to the copy bundled in app/data; override to point elsewhere
    # (e.g. the canonical docs/03-data/spaces.catalog.json).
    CATALOG_PATH: str | None = None

    # ── HTTP / CORS ─────────────────────────────────────────────────────────
    # Comma-separated origins allowed to call this service (the frontend).
    CORS_ORIGINS: str = "http://localhost:3000,http://localhost:5173"

    @property
    def cors_origins_list(self) -> list[str]:
        """Parse CORS_ORIGINS into a list, trimming whitespace/empties."""
        return [o.strip() for o in self.CORS_ORIGINS.split(",") if o.strip()]


@lru_cache
def get_settings() -> Settings:
    """Return a cached Settings singleton."""
    return Settings()


# Module-level convenience handle.
settings = get_settings()
