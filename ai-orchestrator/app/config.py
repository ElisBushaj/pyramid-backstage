"""Application configuration via pydantic-settings.

All values load from the environment (or a local ``.env``). The single runtime
coupling to ops-core is ``OPS_CORE_URL``.
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
    OPS_CORE_URL: str = "http://localhost:4000/api/v1"

    # ── F17 service-token auth ───────────────────────────────────────────────
    # Shared secret; must equal ops-core's OPS_CORE_SERVICE_TOKEN.
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
    # LLM-polish the plan narrative into natural prose (FAST_MODEL). The figures are
    # still injected from ops-core: a numeric guard rejects any rewrite that invents
    # or drops a number, falling back to the deterministic f-string (#2). Needs a key.
    NARRATIVE_POLISH: bool = True

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
