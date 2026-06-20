// Static venue reference data (F14 / ADR-0013) sourced from docs/03-data/spaces.catalog.json.
// Shipped as a frontend constant — it is static reference data, not a contract endpoint.
// Alvin's ai-orchestrator loads the SAME JSON into its venue_facts; this is the UI mirror used
// by the FloorMap (F19) + bundle hints. Space rows themselves come from GET /private/spaces.
import type { Layout, SpaceCategory } from '../api/types/spaces'

export interface BundleRole {
  role: string
  /** A single category or a set of acceptable categories for this role. */
  category: SpaceCategory | SpaceCategory[]
  layout?: Layout
  note?: string
  optional?: boolean
}

export interface BundleTemplate {
  key: string
  /** Human-readable trigger condition, keyed off the event type. */
  when: string
  roles: BundleRole[]
}

/** Space bundles — a coherent plan is often hall + foyer + green-room, not a single box. */
export const BUNDLE_TEMPLATES: BundleTemplate[] = [
  {
    key: 'conference',
    when: 'eventType=CONFERENCE',
    roles: [
      { role: 'main', category: 'HALL', layout: 'THEATER', note: 'talks' },
      { role: 'registration', category: ['ENTRANCE', 'ATRIUM', 'TRANSITIONAL'], note: 'check-in + coffee' },
      { role: 'green_room', category: 'BOX', note: 'speakers / staff', optional: true },
    ],
  },
  {
    key: 'exhibition',
    when: 'eventType=EXHIBITION',
    roles: [
      { role: 'main', category: 'HALL', layout: 'RECEPTION', note: 'booths' },
      { role: 'overflow', category: ['CORRIDOR', 'TRANSITIONAL'], note: 'extra booths / flow', optional: true },
    ],
  },
  {
    key: 'gala',
    when: 'eventType in (COMMUNITY,PRIVATE,PERFORMANCE)',
    roles: [
      { role: 'main', category: 'HALL', layout: 'BANQUET', note: 'dinner' },
      { role: 'welcome', category: 'ATRIUM', layout: 'RECEPTION', note: 'welcome drinks' },
    ],
  },
]

/** Circulation rules — booking a circulation space affects access to its neighbours. */
export const CIRCULATION_RULES: string[] = [
  "Booking an isCirculation space for an event blocks/limits access to its 'adjacent' spaces during the effective window — surface as an access warning, prefer an alternative.",
  'Step-free access: if an event needs step_free, prefer routing registration/flow through step_free circulation spaces.',
]
