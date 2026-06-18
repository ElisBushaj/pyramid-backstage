# Findings — defect log

Every `fail` in [`CHECKLIST.md`](./CHECKLIST.md) or [`DESIGN-PARITY.md`](./DESIGN-PARITY.md) gets an entry here. The QA task links back to its finding (`**Status:** fail (see [F-001](#f-001))`); when fixed, set the finding `status: resolved` and re-run the QA task to `pass`.

## Format

```
### F-001 — <short title>
- Severity: blocker | major | minor | trivial
- Area: <QA area code or QA-DSGN-§>  ·  Found by: QA-<AREA>-NN
- Status: open | in_progress | resolved
- Steps: <how to reproduce>
- Expected: <what the contract / design says>
- Actual: <what happened>
- Fix: <commit / PR / note, once resolved>
```

**Severity guide:** `blocker` = breaks the demo path or corrupts state (a double-booked room, a wrong total, an approval bypassing the role gate); `major` = a feature is wrong but the demo survives; `minor` = cosmetic or edge-case; `trivial` = copy/polish.

---

*No findings yet — the build is in progress. Entries land here as the functional and design-parity sweeps run.*
