/*
 * ─────────────────────────────────────────────────────────────────────────────
 * mock-ops-core — a STATEFUL in-memory mock of ops-core.
 *
 * WHY THIS EXISTS: the AI's deterministic conflict branch keys off a real
 * `409 { conflicts }` from `POST /reservations`. A static mock (Prism replaying
 * OpenAPI examples) cannot model "hold A succeeds, hold B in the same window
 * conflicts" — it has no state. This mock does: it seeds inventory + ONE
 * pre-existing CONFIRMED reservation that plants a deliberate conflict window,
 * implements the half-open buffer-aware overlap exactly as CONFLICTS.md
 * describes, and returns the SAME ServiceResponse envelope + the SAME error
 * contract bodies as the real ops-core. Flip the AI's OPS_CORE_URL here and the
 * conflict path is genuinely testable in isolation.
 *
 * NOT a substitute for ops-core: no DB, no auth, no NATS, no idempotency cache,
 * no reaper thread (HELD leases are checked-on-read instead). It honors the
 * CONTRACT SHAPES + the conflict semantics — that's the point.
 *
 * AUTH: none. The real ops-core gates /private behind a session cookie; the mock
 * deliberately skips auth so the AI can hit it with zero ceremony. (Noted per
 * the brief — do not copy this into ops-core.)
 *
 * Contract: ../ops-core/openapi.yaml  ·  Conflicts: ../docs/02-domain/CONFLICTS.md
 * Reservations: ../docs/02-domain/RESERVATIONS.md  ·  Errors: ../docs/04-api/ERROR_CONTRACT.md
 * ─────────────────────────────────────────────────────────────────────────────
 */

import express, { type Request, type Response } from 'express';

const PORT = Number(process.env.PORT ?? 4010);

// ═════════════════════════════════════════════════════════════════════════════
// TYPES (mirror ops-core/openapi.yaml — UPPER_SNAKE enums)
// ═════════════════════════════════════════════════════════════════════════════
type Currency = 'ALL';
type SpaceKind = 'MAIN' | 'TRANSITIONAL';
type AssetType =
  | 'SEATING' | 'TABLE' | 'MICROPHONE' | 'SCREEN' | 'PROJECTOR' | 'STAGE_UNIT' | 'LIGHTING' | 'OTHER';
type AssetStatus = 'ACTIVE' | 'MAINTENANCE' | 'RETIRED';
type EventType =
  | 'CONFERENCE' | 'EXHIBITION' | 'WORKSHOP' | 'PERFORMANCE' | 'COMMUNITY' | 'PRIVATE' | 'OTHER';
type RequestStatus = 'DRAFT' | 'PROPOSED' | 'APPROVED' | 'SCHEDULED' | 'COMPLETED' | 'REJECTED';
type ReservationStatus = 'HELD' | 'CONFIRMED' | 'RELEASED';
type QuoteStatus = 'DRAFT' | 'SENT' | 'ACCEPTED' | 'EXPIRED';
type TaskPhase = 'SETUP' | 'TEARDOWN';
type TaskStatus = 'TODO' | 'IN_PROGRESS' | 'DONE' | 'BLOCKED';
type LineItemKind = 'SPACE' | 'ASSET' | 'SERVICE';
type ConflictType = 'SPACE_DOUBLE_BOOKED' | 'ASSET_OVERALLOCATED' | 'SETUP_WINDOW_OVERLAP';

interface DateRange { start: string; end: string }

interface Space {
  id: string;
  name: string;
  floor: number;
  kind: SpaceKind;
  capacities: Record<string, number>;
  features: string[];
  dayRateMinor: number;
  currency: Currency;
  setupBufferMinutes: number;
  teardownBufferMinutes: number;
  status: 'ACTIVE' | 'INACTIVE';
}

interface Asset {
  id: string;
  name: string;
  type: AssetType;
  totalQuantity: number;
  location: string;
  status: AssetStatus;
}

interface ReservedAsset { assetId: string; quantity: number }

interface Reservation {
  id: string;
  requestId: string;
  spaceId: string;
  dateRange: DateRange;
  effectiveStart: string; // dateRange.start − space.setupBuffer
  effectiveEnd: string; // dateRange.end + space.teardownBuffer
  assets: ReservedAsset[];
  status: ReservationStatus;
  expiresAt: string | null; // when a HELD lease lapses; null once CONFIRMED
  createdById: string;
  createdAt: string;
}

interface EventRequest {
  id: string;
  title: string;
  organizerName: string;
  contactEmail?: string;
  contactPhone?: string;
  expectedAttendees: number;
  eventType: EventType;
  preferredDates: DateRange[];
  requirements?: Record<string, unknown>;
  status: RequestStatus;
  rejectionReason?: string;
  createdById: string;
  createdAt: string;
  updatedAt: string;
}

interface LineItem {
  label: string;
  kind: LineItemKind;
  qty: number;
  unitPriceMinor: number;
  subtotalMinor: number;
}

interface Quote {
  id: string;
  requestId: string;
  currency: Currency;
  lineItems: LineItem[];
  netMinor: number;
  vatRate: number;
  vatMinor: number;
  totalMinor: number;
  status: QuoteStatus;
  version: number;
  expiresAt: string;
  createdAt: string;
}

interface Task {
  id: string;
  requestId: string;
  title: string;
  phase: TaskPhase;
  owner?: string;
  assigneeId?: string;
  dueOffsetHours?: number;
  dueAt?: string;
  status: TaskStatus;
}

interface Conflict {
  type: ConflictType;
  spaceId?: string;
  assetId?: string;
  requested?: number;
  available?: number;
  conflictingRequestIds?: string[];
  window: DateRange;
  detail: string;
}

// ═════════════════════════════════════════════════════════════════════════════
// IN-MEMORY STORE
// ═════════════════════════════════════════════════════════════════════════════
const db = {
  spaces: [] as Space[],
  assets: [] as Asset[],
  requests: [] as EventRequest[],
  reservations: [] as Reservation[],
  quotes: [] as Quote[],
  tasks: [] as Task[],
  // F16 — QR/NFC movement ledger (aggregate-with-movement).
  movements: [] as Array<{
    id: string; assetId: string; action: string; quantity: number;
    fromLocation: string | null; toLocation: string; reservationId: string | null;
    actorId: string | null; note: string | null; at: string;
  }>,
};

let seq = 0;
const nextId = (prefix: string): string => `${prefix}_${(++seq).toString(36)}`;
const nowIso = (): string => new Date().toISOString();

// ═════════════════════════════════════════════════════════════════════════════
// ENVELOPE + ERROR CONTRACT (match ops-core exactly)
// ═════════════════════════════════════════════════════════════════════════════

/** Success: { status: "OK", message, messageKey, data } — the ServiceEnvelope. */
function ok<T>(res: Response, data: T, messageKey: string, statusCode = 200): void {
  res.status(statusCode).json({ status: 'OK', message: messageKey, messageKey, data });
}

/** Generic error body per docs/04-api/ERROR_CONTRACT.md. */
function fail(
  res: Response,
  statusCode: number,
  error: string,
  messageKey: string,
  extra: Record<string, unknown> = {},
): void {
  res.status(statusCode).json({ status: statusCode, error, message: messageKey, messageKey, ...extra });
}

/** 409 conflict — carries the full Conflict[] (the agent's branch keys off this). */
function conflict(res: Response, conflicts: Conflict[]): void {
  fail(res, 409, 'conflict', 'reservation.conflict', { conflicts });
}

/** 422 field validation. */
function validation(res: Response, fields: Record<string, string>): void {
  fail(res, 422, 'validation', 'validation.failed', { fields });
}

// ═════════════════════════════════════════════════════════════════════════════
// THE CORRECTNESS CORE — half-open, buffer-aware overlap (CONFLICTS.md)
// ═════════════════════════════════════════════════════════════════════════════

/**
 * Half-open interval overlap. Windows A = [aStart, aEnd) and B = [bStart, bEnd)
 * overlap iff (aStart < bEnd AND bStart < aEnd). Half-open so 10:00–14:00 and
 * 14:00–18:00 do NOT overlap (touching boundaries are fine). Operates on epoch
 * millis. (Mirror of utils/time.ts::overlaps() — never hand-roll elsewhere.)
 */
function overlaps(aStart: number, aEnd: number, bStart: number, bEnd: number): boolean {
  return aStart < bEnd && bStart < aEnd;
}

const ms = (iso: string): number => new Date(iso).getTime();
const addMinutes = (iso: string, minutes: number): string =>
  new Date(ms(iso) + minutes * 60_000).toISOString();

/**
 * Effective occupancy window for a reservation in a given space — the EVENT
 * window padded by that space's setup/teardown buffers:
 *   effectiveStart = dateRange.start − setupBuffer
 *   effectiveEnd   = dateRange.end   + teardownBuffer
 * Availability + conflict detection always test the EFFECTIVE window. This is
 * what makes two back-to-back events surface as SETUP_WINDOW_OVERLAP instead of
 * silently colliding. (ADR-0009)
 */
function effectiveWindow(space: Space, range: DateRange): { start: number; end: number } {
  return {
    start: ms(range.start) - space.setupBufferMinutes * 60_000,
    end: ms(range.end) + space.teardownBufferMinutes * 60_000,
  };
}

/** A HELD lease only counts while it hasn't lapsed (defensive check-on-read,
 *  standing in for the reaper). CONFIRMED always counts; RELEASED never does. */
function isActive(r: Reservation, atMs: number): boolean {
  if (r.status === 'RELEASED') return false;
  if (r.status === 'CONFIRMED') return true;
  // HELD: only if expiresAt is in the future.
  return r.expiresAt != null && ms(r.expiresAt) > atMs;
}

/**
 * detectConflicts(space, requestedRange, requestedAssets) → Conflict[].
 *
 * The authoritative check, used both proactively (GET /conflicts) and defensively
 * inside the reservation transaction. Excludes `ignoreReservationId` (so a
 * reservation never conflicts with itself on re-check).
 *
 * Fires the three conflict types per CONFLICTS.md:
 *   • SPACE_DOUBLE_BOOKED — effective windows overlap AND event windows overlap.
 *   • SETUP_WINDOW_OVERLAP — effective windows overlap but event windows do NOT
 *                            (the buffer zones collide; not enough turnaround).
 *   • ASSET_OVERALLOCATED  — requested > availableQuantity in the window, where
 *                            available = total − Σ overlapping active holds.
 */
function detectConflicts(
  space: Space,
  requestedRange: DateRange,
  requestedAssets: ReservedAsset[],
  ignoreReservationId?: string,
): Conflict[] {
  const out: Conflict[] = [];
  const at = Date.now();
  const eff = effectiveWindow(space, requestedRange);
  const reqEvStart = ms(requestedRange.start);
  const reqEvEnd = ms(requestedRange.end);

  // ── space: scan same-space active reservations ────────────────────────────
  for (const r of db.reservations) {
    if (r.id === ignoreReservationId) continue;
    if (r.spaceId !== space.id) continue;
    if (!isActive(r, at)) continue;

    const otherEff = { start: ms(r.effectiveStart), end: ms(r.effectiveEnd) };
    if (!overlaps(eff.start, eff.end, otherEff.start, otherEff.end)) continue;

    // Effective windows collide. Distinguish a true double-book from a mere
    // buffer-zone (setup/teardown) overlap by testing the EVENT windows.
    const eventsOverlap = overlaps(reqEvStart, reqEvEnd, ms(r.dateRange.start), ms(r.dateRange.end));
    if (eventsOverlap) {
      out.push({
        type: 'SPACE_DOUBLE_BOOKED',
        spaceId: space.id,
        conflictingRequestIds: [r.requestId],
        window: requestedRange,
        detail: `${space.name} already reserved for ${r.requestId} in this window.`,
      });
    } else {
      out.push({
        type: 'SETUP_WINDOW_OVERLAP',
        spaceId: space.id,
        conflictingRequestIds: [r.requestId],
        window: requestedRange,
        detail:
          `${space.name} doesn't overlap ${r.requestId}'s event window, but there isn't ` +
          `enough setup/teardown turnaround time between them.`,
      });
    }
  }

  // ── assets: windowed availability = total − Σ overlapping active holds ─────
  // The window for an asset overlap is the requested EFFECTIVE window (the asset
  // is committed for the whole occupancy span, buffers included).
  for (const want of requestedAssets) {
    const asset = db.assets.find((a) => a.id === want.assetId);
    if (!asset) {
      out.push({
        type: 'ASSET_OVERALLOCATED',
        assetId: want.assetId,
        requested: want.quantity,
        available: 0,
        window: requestedRange,
        detail: `Unknown asset ${want.assetId}.`,
      });
      continue;
    }
    const available = availableQuantity(asset, eff, ignoreReservationId, at);
    if (want.quantity > available) {
      out.push({
        type: 'ASSET_OVERALLOCATED',
        assetId: asset.id,
        requested: want.quantity,
        available,
        conflictingRequestIds: overlappingHolderRequestIds(asset, eff, ignoreReservationId, at),
        window: requestedRange,
        detail:
          `Only ${available} of ${asset.totalQuantity} ${asset.name} free in this window ` +
          `(${asset.totalQuantity - available} held elsewhere).`,
      });
    }
  }

  return out;
}

/**
 * availableQuantity(asset, window) = totalQuantity − Σ ra.quantity for every
 * reserved-asset line whose reservation is active and whose EFFECTIVE window
 * overlaps `window`. (Each holder's effective window is computed against ITS OWN
 * space's buffers.) NOT "is total ≥ requested".
 */
function availableQuantity(
  asset: Asset,
  window: { start: number; end: number },
  ignoreReservationId: string | undefined,
  at: number,
): number {
  let held = 0;
  for (const r of db.reservations) {
    if (r.id === ignoreReservationId) continue;
    if (!isActive(r, at)) continue;
    if (!overlaps(window.start, window.end, ms(r.effectiveStart), ms(r.effectiveEnd))) continue;
    for (const ra of r.assets) {
      if (ra.assetId === asset.id) held += ra.quantity;
    }
  }
  return asset.totalQuantity - held;
}

/** The requestIds of active reservations that overlap `window` and hold `asset`. */
function overlappingHolderRequestIds(
  asset: Asset,
  window: { start: number; end: number },
  ignoreReservationId: string | undefined,
  at: number,
): string[] {
  const ids = new Set<string>();
  for (const r of db.reservations) {
    if (r.id === ignoreReservationId) continue;
    if (!isActive(r, at)) continue;
    if (!overlaps(window.start, window.end, ms(r.effectiveStart), ms(r.effectiveEnd))) continue;
    if (r.assets.some((ra) => ra.assetId === asset.id)) ids.add(r.requestId);
  }
  return [...ids];
}

/** Buffer-aware space availability for a window (used by GET /spaces & /:id/availability). */
function spaceAvailability(space: Space, range: DateRange): {
  available: boolean;
  conflictingRequestIds: string[];
} {
  const conflicts = detectConflicts(space, range, []);
  const ids = new Set<string>();
  for (const c of conflicts) for (const id of c.conflictingRequestIds ?? []) ids.add(id);
  return { available: conflicts.length === 0, conflictingRequestIds: [...ids] };
}

// ═════════════════════════════════════════════════════════════════════════════
// SEED — 4 spaces, 6 asset lines, ONE planted CONFIRMED reservation.
// ═════════════════════════════════════════════════════════════════════════════
function seed(): void {
  // ── 4 halls (Blue / Orange / Green / Yellow) with capacities + buffers ─────
  db.spaces.push(
    {
      id: 'space_blue',
      name: 'Blue Hall',
      floor: 0,
      kind: 'MAIN',
      capacities: { THEATER: 220, CLASSROOM: 120, BANQUET: 160, RECEPTION: 300 },
      features: ['stage', 'av_builtin', 'step_free'],
      dayRateMinor: 80000,
      currency: 'ALL',
      setupBufferMinutes: 240,
      teardownBufferMinutes: 120,
      status: 'ACTIVE',
    },
    {
      id: 'space_orange',
      name: 'Orange Hall',
      floor: 0,
      kind: 'MAIN',
      capacities: { THEATER: 200, CLASSROOM: 110, BANQUET: 150, RECEPTION: 260 },
      features: ['stage', 'step_free'],
      dayRateMinor: 70000,
      currency: 'ALL',
      setupBufferMinutes: 180,
      teardownBufferMinutes: 120,
      status: 'ACTIVE',
    },
    {
      id: 'space_green',
      name: 'Green Hall',
      floor: -1,
      kind: 'MAIN',
      capacities: { THEATER: 120, CLASSROOM: 70, BANQUET: 90, RECEPTION: 140 },
      features: ['av_builtin'],
      dayRateMinor: 50000,
      currency: 'ALL',
      setupBufferMinutes: 120,
      teardownBufferMinutes: 120,
      status: 'ACTIVE',
    },
    {
      id: 'space_yellow',
      name: 'Yellow Hall',
      floor: -1,
      kind: 'TRANSITIONAL',
      capacities: { RECEPTION: 90, BOARDROOM: 30, CABARET: 60 },
      features: ['step_free'],
      dayRateMinor: 30000,
      currency: 'ALL',
      setupBufferMinutes: 90,
      teardownBufferMinutes: 60,
      status: 'ACTIVE',
    },
  );

  // ── ~6 asset lines ─────────────────────────────────────────────────────────
  db.assets.push(
    { id: 'asset_chair_std', name: 'Standard chair', type: 'SEATING', totalQuantity: 400, location: 'Storage -1', status: 'ACTIVE' },
    { id: 'asset_table_round', name: 'Round table', type: 'TABLE', totalQuantity: 80, location: 'Storage -1', status: 'ACTIVE' },
    { id: 'asset_mic', name: 'Wireless microphone', type: 'MICROPHONE', totalQuantity: 12, location: 'AV room', status: 'ACTIVE' },
    { id: 'asset_screen', name: 'Projection screen', type: 'SCREEN', totalQuantity: 6, location: 'AV room', status: 'ACTIVE' },
    { id: 'asset_projector', name: 'Projector', type: 'PROJECTOR', totalQuantity: 6, location: 'AV room', status: 'ACTIVE' },
    { id: 'asset_stage_unit', name: 'Stage riser unit', type: 'STAGE_UNIT', totalQuantity: 10, location: 'Storage -1', status: 'ACTIVE' },
  );

  // ── ONE pre-existing CONFIRMED reservation that PLANTS a conflict ──────────
  // Blue Hall, all day on 2026-07-22 (07:00–20:00Z event window), holding most of
  // the chairs + several mics. Any new hold whose EFFECTIVE window touches this
  // span in Blue Hall → SPACE_DOUBLE_BOOKED (or SETUP_WINDOW_OVERLAP if only the
  // buffers collide). A new hold elsewhere that wants > (400 − 360 = 40) chairs in
  // an overlapping window → ASSET_OVERALLOCATED. This is the demo conflict.
  const plantedReq: EventRequest = {
    id: 'req_planted',
    title: 'Pyramid Annual Gala (pre-booked)',
    organizerName: 'Pyramid of Tirana',
    contactEmail: 'events@pyramid.al',
    expectedAttendees: 300,
    eventType: 'COMMUNITY',
    preferredDates: [{ start: '2026-07-22T07:00:00Z', end: '2026-07-22T20:00:00Z' }],
    status: 'SCHEDULED',
    createdById: 'seed',
    createdAt: nowIso(),
    updatedAt: nowIso(),
  };
  db.requests.push(plantedReq);

  const blue = db.spaces.find((s) => s.id === 'space_blue')!;
  const plantedRange: DateRange = { start: '2026-07-22T07:00:00Z', end: '2026-07-22T20:00:00Z' };
  const eff = effectiveWindow(blue, plantedRange);
  db.reservations.push({
    id: 'resv_planted',
    requestId: 'req_planted',
    spaceId: 'space_blue',
    dateRange: plantedRange,
    effectiveStart: new Date(eff.start).toISOString(),
    effectiveEnd: new Date(eff.end).toISOString(),
    assets: [
      { assetId: 'asset_chair_std', quantity: 360 }, // leaves 40 free in this window
      { assetId: 'asset_mic', quantity: 8 }, // leaves 4 free
    ],
    status: 'CONFIRMED',
    expiresAt: null,
    createdById: 'seed',
    createdAt: nowIso(),
  });
}

// ═════════════════════════════════════════════════════════════════════════════
// APP + ROUTES (all under /api/v1/private — no auth, per the brief)
// ═════════════════════════════════════════════════════════════════════════════
const app = express();
app.use(express.json());

// ── health ────────────────────────────────────────────────────────────────────
app.get('/health', (_req: Request, res: Response) => res.status(200).json({ status: 'OK' }));
app.get('/ready', (_req: Request, res: Response) => res.status(200).json({ status: 'OK' }));

// ── GET /private/spaces — match + optional windowed availability ───────────────
app.get('/api/v1/private/spaces', (req: Request, res: Response) => {
  const minCapacity = req.query.minCapacity ? Number(req.query.minCapacity) : undefined;
  const layout = req.query.layout as string | undefined;
  const start = req.query.start as string | undefined;
  const end = req.query.end as string | undefined;

  let spaces = db.spaces.filter((s) => s.status === 'ACTIVE');
  if (layout) spaces = spaces.filter((s) => layout in s.capacities);
  if (minCapacity != null) {
    spaces = spaces.filter((s) => {
      const caps = layout ? [s.capacities[layout] ?? 0] : Object.values(s.capacities);
      return Math.max(0, ...caps) >= minCapacity;
    });
  }

  const withWindow = start && end;
  const data = spaces.map((s) => {
    if (!withWindow) return s;
    return { ...s, available: spaceAvailability(s, { start, end }).available };
  });
  ok(res, data, 'spaces.list.success');
});

// ── GET /private/spaces/:id/availability — one space, buffer-aware ─────────────
app.get('/api/v1/private/spaces/:id/availability', (req: Request, res: Response) => {
  const space = db.spaces.find((s) => s.id === req.params.id);
  if (!space) return fail(res, 404, 'not_found', 'space.not_found');
  const start = req.query.start as string | undefined;
  const end = req.query.end as string | undefined;
  if (!start || !end) return validation(res, { start: 'validation.required', end: 'validation.required' });
  const { available, conflictingRequestIds } = spaceAvailability(space, { start, end });
  ok(res, { spaceId: space.id, available, conflictingRequestIds }, 'space.availability.success');
});

// ── GET /private/assets — inventory + windowed availableQuantity ───────────────
app.get('/api/v1/private/assets', (req: Request, res: Response) => {
  const type = req.query.type as string | undefined;
  const start = req.query.start as string | undefined;
  const end = req.query.end as string | undefined;

  let assets = db.assets.filter((a) => a.status === 'ACTIVE');
  if (type) assets = assets.filter((a) => a.type === type);

  const withWindow = start && end;
  const at = Date.now();
  const data = assets.map((a) => {
    if (!withWindow) return a;
    // The query window has no buffers of its own; availability is computed
    // against the raw [start, end) — each holder still contributes its OWN
    // buffer-padded effective window via availableQuantity().
    const window = { start: ms(start), end: ms(end) };
    return { ...a, availableQuantity: availableQuantity(a, window, undefined, at) };
  });
  ok(res, data, 'assets.list.success');
});

// ── F16: POST /private/assets/:id/scan — record a movement + update live location ──
app.post('/api/v1/private/assets/:id/scan', (req: Request, res: Response) => {
  const asset = db.assets.find((a) => a.id === req.params.id);
  if (!asset) return fail(res, 404, 'not_found', 'asset.not_found');
  const b = req.body ?? {};
  const fields: Record<string, string> = {};
  if (!['CHECK_OUT', 'CHECK_IN', 'RELOCATE'].includes(b.action)) fields.action = 'validation.enum';
  if (!Number.isInteger(b.quantity) || b.quantity < 1) fields.quantity = 'validation.min';
  if (!b.toLocation) fields.toLocation = 'validation.required';
  if (Object.keys(fields).length) return validation(res, fields);

  const net = db.movements
    .filter((m) => m.assetId === asset.id)
    .reduce((n, m) => n + (m.action === 'CHECK_OUT' ? m.quantity : m.action === 'CHECK_IN' ? -m.quantity : 0), 0);
  if (b.action === 'CHECK_OUT' && net + b.quantity > asset.totalQuantity) return validation(res, { quantity: 'asset.scan.over_checkout' });
  if (b.action === 'CHECK_IN' && b.quantity > net) return validation(res, { quantity: 'asset.scan.over_checkin' });

  const movement = {
    id: `mv_${db.movements.length + 1}`, assetId: asset.id, action: b.action, quantity: b.quantity,
    fromLocation: asset.location, toLocation: b.toLocation, reservationId: b.reservationId ?? null,
    actorId: null, note: b.note ?? null, at: new Date().toISOString(),
  };
  db.movements.push(movement);
  asset.location = b.toLocation;
  const newNet = b.action === 'CHECK_OUT' ? net + b.quantity : b.action === 'CHECK_IN' ? net - b.quantity : net;
  ok(res, { asset: { ...asset, checkedOutQuantity: Math.max(0, newNet), lastMovedAt: movement.at }, movement }, 'asset.scanned', 201);
});

// ── F16: GET /private/assets/:id/movements — the ledger, newest first ──────────────
app.get('/api/v1/private/assets/:id/movements', (req: Request, res: Response) => {
  const asset = db.assets.find((a) => a.id === req.params.id);
  if (!asset) return fail(res, 404, 'not_found', 'asset.not_found');
  const data = db.movements.filter((m) => m.assetId === asset.id).sort((a, b) => b.at.localeCompare(a.at));
  ok(res, data, 'asset.movements.success');
});

// ── POST /private/requests — create a structured event request ─────────────────
app.post('/api/v1/private/requests', (req: Request, res: Response) => {
  const b = req.body ?? {};
  const fields: Record<string, string> = {};
  if (!b.title) fields.title = 'validation.required';
  if (!b.organizerName) fields.organizerName = 'validation.required';
  if (b.expectedAttendees == null) fields.expectedAttendees = 'validation.required';
  if (!b.eventType) fields.eventType = 'validation.required';
  if (!Array.isArray(b.preferredDates) || b.preferredDates.length < 1) {
    fields.preferredDates = 'validation.required';
  }
  if (Object.keys(fields).length) return validation(res, fields);

  const now = nowIso();
  const request: EventRequest = {
    id: nextId('req'),
    title: b.title,
    organizerName: b.organizerName,
    contactEmail: b.contactEmail,
    contactPhone: b.contactPhone,
    expectedAttendees: Number(b.expectedAttendees),
    eventType: b.eventType,
    preferredDates: b.preferredDates,
    requirements: b.requirements,
    status: 'DRAFT',
    createdById: 'mock',
    createdAt: now,
    updatedAt: now,
  };
  db.requests.push(request);
  ok(res, request, 'request.created.success', 201);
});

// ── GET /private/requests/:id — full aggregate ─────────────────────────────────
app.get('/api/v1/private/requests/:id', (req: Request, res: Response) => {
  const request = db.requests.find((r) => r.id === req.params.id);
  if (!request) return fail(res, 404, 'not_found', 'request.not_found');
  const reservation = db.reservations.find((r) => r.requestId === request.id && r.status !== 'RELEASED');
  const quote = db.quotes.find((q) => q.requestId === request.id);
  const tasks = db.tasks.filter((t) => t.requestId === request.id);
  let conflicts: Conflict[] = [];
  if (reservation) {
    const space = db.spaces.find((s) => s.id === reservation.spaceId);
    if (space) conflicts = detectConflicts(space, reservation.dateRange, reservation.assets, reservation.id);
  }
  ok(res, { request, reservation, quote, tasks, conflicts, audit: [] }, 'request.aggregate.success');
});

// ── POST /private/reservations — atomic hold; REAL 409 conflict path ───────────
app.post('/api/v1/private/reservations', (req: Request, res: Response) => {
  const b = req.body ?? {};
  const fields: Record<string, string> = {};
  if (!b.requestId) fields.requestId = 'validation.required';
  if (!b.spaceId) fields.spaceId = 'validation.required';
  if (!b.dateRange?.start || !b.dateRange?.end) fields.dateRange = 'validation.required';
  if (Object.keys(fields).length) return validation(res, fields);

  const space = db.spaces.find((s) => s.id === b.spaceId);
  if (!space) return fail(res, 404, 'not_found', 'space.not_found');

  const range: DateRange = b.dateRange;
  const assets: ReservedAsset[] = Array.isArray(b.assets) ? b.assets : [];

  // Re-validate availability against current state (the "transaction"). On ANY
  // conflict the whole hold fails — nothing is written. This is the deterministic
  // 409 the AI's conflict branch keys off.
  const conflicts = detectConflicts(space, range, assets);
  if (conflicts.length > 0) return conflict(res, conflicts);

  const holdMinutes = Number(b.holdMinutes ?? 30);
  const eff = effectiveWindow(space, range);
  const now = nowIso();
  const reservation: Reservation = {
    id: nextId('resv'),
    requestId: b.requestId,
    spaceId: b.spaceId,
    dateRange: range,
    effectiveStart: new Date(eff.start).toISOString(),
    effectiveEnd: new Date(eff.end).toISOString(),
    assets,
    status: 'HELD',
    expiresAt: addMinutes(now, holdMinutes),
    createdById: 'mock',
    createdAt: now,
  };
  db.reservations.push(reservation);
  ok(res, reservation, 'reservation.held.success', 201);
});

// ── POST /private/reservations/:id/confirm — HELD → CONFIRMED (idempotent) ─────
app.post('/api/v1/private/reservations/:id/confirm', (req: Request, res: Response) => {
  const r = db.reservations.find((x) => x.id === req.params.id);
  if (!r) return fail(res, 404, 'not_found', 'reservation.not_found');
  if (r.status === 'CONFIRMED') return ok(res, r, 'reservation.confirmed.success'); // idempotent

  if (r.status === 'RELEASED') {
    return fail(res, 409, 'invalid_transition', 'reservation.invalid_transition', {
      from: 'RELEASED',
      to: 'CONFIRMED',
    });
  }
  // HELD: if the lease lapsed, re-detect and return 409 conflict so the AI re-plans.
  if (r.expiresAt != null && ms(r.expiresAt) <= Date.now()) {
    const space = db.spaces.find((s) => s.id === r.spaceId)!;
    const conflicts = detectConflicts(space, r.dateRange, r.assets, r.id);
    return conflict(res, conflicts.length ? conflicts : [
      {
        type: 'SPACE_DOUBLE_BOOKED',
        spaceId: r.spaceId,
        window: r.dateRange,
        detail: 'Hold expired before confirmation; re-plan required.',
      },
    ]);
  }
  r.status = 'CONFIRMED';
  r.expiresAt = null;
  ok(res, r, 'reservation.confirmed.success');
});

// ── POST /private/reservations/:id/release — back to inventory ─────────────────
app.post('/api/v1/private/reservations/:id/release', (req: Request, res: Response) => {
  const r = db.reservations.find((x) => x.id === req.params.id);
  if (!r) return fail(res, 404, 'not_found', 'reservation.not_found');
  r.status = 'RELEASED';
  r.expiresAt = null;
  ok(res, r, 'reservation.released.success');
});

// ── POST /private/quotes — VAT 20%, total server-computed ──────────────────────
app.post('/api/v1/private/quotes', (req: Request, res: Response) => {
  const b = req.body ?? {};
  if (!b.requestId) return validation(res, { requestId: 'validation.required' });
  const request = db.requests.find((r) => r.id === b.requestId);
  if (!request) return fail(res, 404, 'not_found', 'request.not_found');

  const reservation =
    (b.reservationId && db.reservations.find((r) => r.id === b.reservationId)) ||
    db.reservations.find((r) => r.requestId === request.id && r.status !== 'RELEASED');

  const lineItems: LineItem[] = [];

  // SPACE line (1 day at the space's day rate).
  if (reservation) {
    const space = db.spaces.find((s) => s.id === reservation.spaceId);
    if (space) {
      lineItems.push({
        label: `${space.name} (1 day)`,
        kind: 'SPACE',
        qty: 1,
        unitPriceMinor: space.dayRateMinor,
        subtotalMinor: space.dayRateMinor,
      });
    }
    // ASSET lines (simple per-unit demo pricing by type).
    const unitPrice: Record<string, number> = {
      SEATING: 50, TABLE: 200, MICROPHONE: 1500, SCREEN: 3000, PROJECTOR: 4000, STAGE_UNIT: 2500, LIGHTING: 1000, OTHER: 0,
    };
    for (const ra of reservation.assets) {
      const asset = db.assets.find((a) => a.id === ra.assetId);
      if (!asset) continue;
      const unit = unitPrice[asset.type] ?? 0;
      lineItems.push({
        label: `${asset.name} ×${ra.quantity}`,
        kind: 'ASSET',
        qty: ra.quantity,
        unitPriceMinor: unit,
        subtotalMinor: unit * ra.quantity,
      });
    }
  }

  // Optional SERVICE line items from the caller (catering, cleaning, …).
  if (Array.isArray(b.extraLineItems)) {
    for (const li of b.extraLineItems) {
      const qty = Number(li.qty);
      const unit = Number(li.unitPriceMinor);
      lineItems.push({ label: li.label, kind: 'SERVICE', qty, unitPriceMinor: unit, subtotalMinor: unit * qty });
    }
  }

  // SERVER-COMPUTED totals: net = Σ subtotals, vat = round(net*rate), total = net+vat.
  const netMinor = lineItems.reduce((sum, li) => sum + li.subtotalMinor, 0);
  const vatRate = 0.2;
  const vatMinor = Math.round(netMinor * vatRate);
  const totalMinor = netMinor + vatMinor;

  const now = nowIso();
  const quote: Quote = {
    id: nextId('quote'),
    requestId: request.id,
    currency: 'ALL',
    lineItems,
    netMinor,
    vatRate,
    vatMinor,
    totalMinor,
    status: 'DRAFT',
    version: 1,
    expiresAt: addMinutes(now, 60 * 24 * 14), // 14 days
    createdAt: now,
  };
  db.quotes.push(quote);
  ok(res, quote, 'quote.created.success', 201);
});

// ── POST /private/requests/:id/tasks — persist setup/teardown task list ────────
app.post('/api/v1/private/requests/:id/tasks', (req: Request, res: Response) => {
  const request = db.requests.find((r) => r.id === req.params.id);
  if (!request) return fail(res, 404, 'not_found', 'request.not_found');
  const incoming = req.body?.tasks;
  if (!Array.isArray(incoming)) return validation(res, { tasks: 'validation.required' });

  const reservation = db.reservations.find((r) => r.requestId === request.id && r.status !== 'RELEASED');
  const created: Task[] = incoming.map((t: Record<string, unknown>) => {
    const phase = (t.phase as TaskPhase) ?? 'SETUP';
    const dueOffsetHours = t.dueOffsetHours as number | undefined;
    let dueAt: string | undefined;
    if (reservation && dueOffsetHours != null) {
      // SETUP offsets relative to event start (negative), TEARDOWN to end (positive).
      const anchor = phase === 'TEARDOWN' ? reservation.dateRange.end : reservation.dateRange.start;
      dueAt = addMinutes(anchor, dueOffsetHours * 60);
    }
    const task: Task = {
      id: nextId('task'),
      requestId: request.id,
      title: String(t.title ?? 'Untitled task'),
      phase,
      owner: t.owner as string | undefined,
      assigneeId: t.assigneeId as string | undefined,
      dueOffsetHours,
      dueAt,
      status: 'TODO',
    };
    db.tasks.push(task);
    return task;
  });
  ok(res, created, 'tasks.created.success', 201);
});

// ── GET /private/conflicts — proactive conflict check for a window ─────────────
app.get('/api/v1/private/conflicts', (req: Request, res: Response) => {
  const start = req.query.start as string | undefined;
  const end = req.query.end as string | undefined;
  const spaceId = req.query.spaceId as string | undefined;
  if (!start || !end) return validation(res, { start: 'validation.required', end: 'validation.required' });

  const range: DateRange = { start, end };
  const spaces = spaceId ? db.spaces.filter((s) => s.id === spaceId) : db.spaces;
  const out: Conflict[] = [];
  for (const space of spaces) out.push(...detectConflicts(space, range, []));
  ok(res, out, 'conflicts.list.success');
});

// ── fallthrough 404 (contract-shaped) ──────────────────────────────────────────
app.use((_req: Request, res: Response) => fail(res, 404, 'not_found', 'route.not_found'));

// ═════════════════════════════════════════════════════════════════════════════
// BOOT
// ═════════════════════════════════════════════════════════════════════════════
seed();
app.listen(PORT, () => {
  // eslint-disable-next-line no-console
  console.log(
    `mock-ops-core (stateful) listening on http://localhost:${PORT}/api/v1\n` +
      `  • ${db.spaces.length} spaces, ${db.assets.length} asset lines seeded\n` +
      `  • planted CONFIRMED reservation resv_planted (req_planted): Blue Hall ` +
      `2026-07-22 07:00–20:00Z → POST /reservations into that window returns 409 {conflicts}`,
  );
});

export { app, db, detectConflicts, overlaps, effectiveWindow };
