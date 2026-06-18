import { describe, it, expect } from "vitest";
import { isLegalTransition, assertTransition } from "./transitions";
import { APIError } from "../../errors";
import type { RequestStatus } from "../../types/api/requests";

const ALL: RequestStatus[] = ["DRAFT", "PROPOSED", "APPROVED", "SCHEDULED", "COMPLETED", "REJECTED"];
const LEGAL: Array<[RequestStatus, RequestStatus]> = [
  ["DRAFT", "PROPOSED"], ["DRAFT", "REJECTED"],
  ["PROPOSED", "APPROVED"], ["PROPOSED", "REJECTED"],
  ["APPROVED", "SCHEDULED"], ["APPROVED", "REJECTED"],
  ["SCHEDULED", "COMPLETED"], ["SCHEDULED", "REJECTED"],
];

describe("request transition guard (F04-T04)", () => {
  it("accepts every legal edge", () => {
    for (const [from, to] of LEGAL) expect(isLegalTransition(from, to), `${from}->${to}`).toBe(true);
  });

  it("rejects every non-legal edge with 409 invalid_transition carrying from/to", () => {
    const legalSet = new Set(LEGAL.map(([a, b]) => `${a}->${b}`));
    for (const from of ALL) {
      for (const to of ALL) {
        if (from === to || legalSet.has(`${from}->${to}`)) continue;
        expect(isLegalTransition(from, to), `${from}->${to} should be illegal`).toBe(false);
        try {
          assertTransition(from, to);
          throw new Error(`expected ${from}->${to} to throw`);
        } catch (e) {
          expect(e).toBeInstanceOf(APIError);
          const err = e as APIError;
          expect(err.status).toBe(409);
          expect(err.error).toBe("invalid_transition");
          expect(err.from).toBe(from);
          expect(err.to).toBe(to);
        }
      }
    }
  });

  it("COMPLETED and REJECTED are terminal", () => {
    for (const to of ALL) {
      expect(isLegalTransition("COMPLETED", to)).toBe(false);
      expect(isLegalTransition("REJECTED", to)).toBe(false);
    }
  });
});
