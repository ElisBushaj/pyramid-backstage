import { ok, type ServiceResponse } from "../../types";
import type { Conflict } from "../../types/api/conflicts";
import { detectConflicts } from "../../services/conflict";

class ConflictsService {
  async check(p: { spaceId?: string; start: string; end: string }): Promise<ServiceResponse<Conflict[]>> {
    const conflicts = await detectConflicts({
      spaceId: p.spaceId,
      start: new Date(p.start),
      end: new Date(p.end),
    });
    return ok(conflicts, "conflict.list.success");
  }
}

export const conflictsService = new ConflictsService();
