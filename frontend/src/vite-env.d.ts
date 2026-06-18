/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** ops-core API base, e.g. http://localhost:4000/api/v1 (see api/client.ts). */
  readonly VITE_OPS_CORE_URL: string
  /** ai-orchestrator origin, e.g. http://localhost:8000. */
  readonly VITE_AI_URL?: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
