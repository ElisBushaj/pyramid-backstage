/**
 * All time math lives here. UTC-canonical. The one rule that prevents
 * double-bookings: overlap is tested on the EFFECTIVE window (event window
 * padded by setup/teardown buffers). See docs/02-domain/CONFLICTS.md.
 */

export interface Interval {
  start: Date;
  end: Date;
}

/** Half-open overlap: [aStart,aEnd) and [bStart,bEnd) overlap iff aStart<bEnd && bStart<aEnd. */
export function overlaps(a: Interval, b: Interval): boolean {
  return a.start.getTime() < b.end.getTime() && b.start.getTime() < a.end.getTime();
}

/** Pad an event window by buffer minutes to get the effective occupancy window. */
export function effectiveWindow(
  start: Date,
  end: Date,
  setupBufferMinutes: number,
  teardownBufferMinutes: number,
): Interval {
  return {
    start: new Date(start.getTime() - setupBufferMinutes * 60_000),
    end: new Date(end.getTime() + teardownBufferMinutes * 60_000),
  };
}

/** Whole days a window spans (ceil), for day-rate pricing. Minimum 1. */
export function billableDays(start: Date, end: Date): number {
  const ms = end.getTime() - start.getTime();
  return Math.max(1, Math.ceil(ms / 86_400_000));
}

export function isValidRange(start: Date, end: Date): boolean {
  return start.getTime() < end.getTime();
}

export function toIso(d: Date): string {
  return d.toISOString();
}
