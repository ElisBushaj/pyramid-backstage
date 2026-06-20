import { describe, it, expect } from "vitest";
import { isLegalTransition, assertTransition, LEGAL_TRANSITIONS } from "./transitions";
import { APIError } from "../../errors";
import type { RequestStatus } from "../../types/api/requests";

const ALL: RequestStatus[] = ["DRAFT", "PROPOSED", "APPROVED", "SCHEDULED", "COMPLETED", "REJECTED"];
const TERMINAL: RequestStatus[] = ["COMPLETED", "REJECTED"];
const LEGAL: Array<[RequestStatus, RequestStatus]> = [
  ["DRAFT", "PROPOSED"], ["DRAFT", "REJECTED"],
  ["PROPOSED", "APPROVED"], ["PROPOSED", "REJECTED"],
  ["APPROVED", "SCHEDULED"], ["APPROVED", "REJECTED"],
  ["SCHEDULED", "COMPLETED"], ["SCHEDULED", "REJECTED"],
];

/** A few illegal edges named explicitly so a regression points at the exact move. */
const NAMED_ILLEGAL: Array<[RequestStatus, RequestStatus]> = [
  ["APPROVED", "DRAFT"], // can't walk back
  ["SCHEDULED", "PROPOSED"], // can't walk back
  ["SCHEDULED", "APPROVED"], // can't walk back
  ["PROPOSED", "SCHEDULED"], // can't skip APPROVED
  ["DRAFT", "APPROVED"], // can't skip PROPOSED
  ["DRAFT", "SCHEDULED"], // can't skip ahead
  ["DRAFT", "COMPLETED"], // can't skip ahead
  ["PROPOSED", "COMPLETED"], // can't skip ahead
  ["APPROVED", "COMPLETED"], // must go via SCHEDULED
  ["REJECTED", "APPROVED"], // approve a rejected request
  ["REJECTED", "PROPOSED"], // reopen a rejected request
  ["REJECTED", "DRAFT"], // reopen a rejected request
  ["COMPLETED", "SCHEDULED"], // reopen a completed request
  ["COMPLETED", "REJECTED"], // reject a completed request
  ["COMPLETED", "DRAFT"], // reopen a completed request
];

describe("request transition guard (F04-T04) — pure state machine", () => {
  it("accepts every legal edge", () => {
    for (const [from, to] of LEGAL) expect(isLegalTransition(from, to), `${from}->${to}`).toBe(true);
  });

  it("the legal map is exactly the documented lifecycle (no extra edges)", () => {
    // DRAFT → PROPOSED → APPROVED → SCHEDULED → COMPLETED, any non-terminal → REJECTED
    expect(LEGAL_TRANSITIONS).toEqual({
      DRAFT: ["PROPOSED", "REJECTED"],
      PROPOSED: ["APPROVED", "REJECTED"],
      APPROVED: ["SCHEDULED", "REJECTED"],
      SCHEDULED: ["COMPLETED", "REJECTED"],
      COMPLETED: [],
      REJECTED: [],
    });
    // every status is a key; every target is a known status
    for (const s of ALL) expect(LEGAL_TRANSITIONS[s]).toBeDefined();
    for (const targets of Object.values(LEGAL_TRANSITIONS)) {
      for (const t of targets) expect(ALL).toContain(t);
    }
  });

  it("every non-terminal status can move to REJECTED", () => {
    for (const from of ALL) {
      if (TERMINAL.includes(from)) continue;
      expect(isLegalTransition(from, "REJECTED"), `${from}->REJECTED`).toBe(true);
    }
  });

  it("a status is never a legal transition to itself (no self-loops)", () => {
    for (const s of ALL) expect(isLegalTransition(s, s), `${s}->${s}`).toBe(false);
  });

  it("rejects every named illegal edge with 409 invalid_transition { from, to }", () => {
    for (const [from, to] of NAMED_ILLEGAL) {
      expect(isLegalTransition(from, to), `${from}->${to} should be illegal`).toBe(false);
      try {
        assertTransition(from, to);
        throw new Error(`expected ${from}->${to} to throw`);
      } catch (e) {
        expect(e, `${from}->${to}`).toBeInstanceOf(APIError);
        const err = e as APIError;
        expect(err.status).toBe(409);
        expect(err.error).toBe("invalid_transition");
        expect(err.messageKey).toBe("request.invalid_transition");
        expect(err.from).toBe(from);
        expect(err.to).toBe(to);
      }
    }
  });

  it("rejects EVERY non-legal edge in the full 6×6 matrix with 409 carrying from/to", () => {
    const legalSet = new Set(LEGAL.map(([a, b]) => `${a}->${b}`));
    let illegalCount = 0;
    for (const from of ALL) {
      for (const to of ALL) {
        if (legalSet.has(`${from}->${to}`)) continue; // skip the 8 legal edges
        illegalCount++;
        expect(isLegalTransition(from, to), `${from}->${to} should be illegal`).toBe(false);
        try {
          assertTransition(from, to);
          throw new Error(`expected ${from}->${to} to throw`);
        } catch (e) {
          expect(e, `${from}->${to}`).toBeInstanceOf(APIError);
          const err = e as APIError;
          expect(err.status).toBe(409);
          expect(err.error).toBe("invalid_transition");
          expect(err.from).toBe(from);
          expect(err.to).toBe(to);
        }
      }
    }
    // 36 ordered pairs − 8 legal edges = 28 illegal (includes the 6 self-loops)
    expect(illegalCount).toBe(28);
  });

  it("COMPLETED and REJECTED are terminal (no outgoing edges at all)", () => {
    for (const to of ALL) {
      expect(isLegalTransition("COMPLETED", to), `COMPLETED->${to}`).toBe(false);
      expect(isLegalTransition("REJECTED", to), `REJECTED->${to}`).toBe(false);
    }
    expect(LEGAL_TRANSITIONS.COMPLETED).toEqual([]);
    expect(LEGAL_TRANSITIONS.REJECTED).toEqual([]);
  });

  it("an unknown / bogus from-status is treated as illegal, not a crash", () => {
    expect(isLegalTransition("BOGUS" as RequestStatus, "PROPOSED")).toBe(false);
    expect(() => assertTransition("BOGUS" as RequestStatus, "PROPOSED")).toThrow(APIError);
  });

  it("assertTransition is a no-op (returns undefined, no throw) for every legal edge", () => {
    for (const [from, to] of LEGAL) {
      expect(assertTransition(from, to), `${from}->${to}`).toBeUndefined();
    }
  });
});
