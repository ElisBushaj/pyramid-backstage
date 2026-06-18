# CLAUDE_DESIGN — drop the Claude Design export here

Put **all files** the Claude Design export gave you **directly in this folder** (flat, not in a sub-folder):

```
CLAUDE_DESIGN/
├── index.html              # the main canvas (if present)
├── *.html                  # per-flow canvases (e.g. "Dashboard.html")
├── *.jsx                   # screen + component files
├── tokens.jsx / .css       # design tokens (if exported separately)
└── …everything else
```

That's it — once the files are here, tell the assistant **"audit the design"** and it will:
1. Inventory every screen/component against `docs/05-frontend/PAGES.md` (the have/missing list).
2. Build the real frontend in `frontend/` to match it — wired to `ops-core` via the contract.
3. Parity-check the build against these artboards per `docs/10-qa/DESIGN-PARITY.md`.

This folder is the **design source of truth** for the frontend build. Don't edit the exported files by hand — re-export from Claude Design if the design changes.
