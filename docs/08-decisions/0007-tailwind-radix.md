# ADR-0007: Tailwind 4 + Radix primitives + an owned component layer

- **Status**: Accepted
- **Date**: 2026-06-18
- **Resolves**: R-05 (visual language)

## Context

The Command Center has to feel like a **calm, trustworthy pro tool** (the reference is Apple's system apps, Linear, Things — not a colorful SaaS dashboard) and be buildable fast from a Claude Design export. The design language is **near-monochrome with a single calm-blue accent, light-first**, with operational status as the only other color ([docs/05-frontend/DESIGN_SYSTEM.md](../05-frontend/DESIGN_SYSTEM.md)). That demands exact, token-driven control of color, spacing, radius, and typography — and accessible, unstyled interaction primitives (menus, dialogs, popovers, tooltips) we can dress ourselves.

The question is the styling + component strategy: utility CSS, a prebuilt component kit, or something in between.

## Decision

**Tailwind 4 for styling, Radix for behavior, an owned component layer (CVA) on top.**

- **Tailwind 4** with **CSS-variable design tokens** exposed via `@theme inline`. Tokens (`--surface`, `--text-secondary`, `--accent`, the status pairs `--success/--warning/--danger/--info` + their `-subtle` backgrounds) are declared as CSS custom properties on `:root` in `frontend/src/styles/tokens.css` and bridged to Tailwind utilities. **Components reference semantic tokens (`bg-surface`, `text-text-secondary`, `bg-accent`) — never a raw hex.** Dark mode can override the same vars under `[data-theme="dark"]`; we **ship light**.
- **Radix primitives** provide accessible, unstyled behavior for overlays and interactive controls (Dialog, Popover, Tooltip, DropdownMenu, etc.) — keyboard handling, focus management, and ARIA come for free.
- **An owned component layer** wraps Radix and bare elements into the project's design system (`Button`, `Input`, `Badge`, `DataTable`, status pills, the copilot panel, …) using **CVA** (class-variance-authority) for variant management. Feature pages consume this layer; they never re-implement a primitive.

See [docs/05-frontend/DESIGN_SYSTEM.md](../05-frontend/DESIGN_SYSTEM.md) for the full token table and component anatomy.

## Consequences

- **Tokens are the single source of visual truth.** Status colors map consistently everywhere (`HELD → warning`, `conflict → danger`, `confirmed → success`, `scheduled → info`); a screen with no problems is almost colorless, by design.
- **Accessibility is built in, not bolted on.** Radix handles focus traps, escape/arrow-key behavior, and ARIA roles — the bar the design system sets for "every state is designed" is reachable.
- **Design-export fidelity is enforceable.** Because every value is a token, the side-by-side parity check against the Claude Design export ([docs/10-qa/DESIGN-PARITY.md](../10-qa/DESIGN-PARITY.md)) compares exact tokens, not eyeballed hexes.
- **We own the look.** Unlike a fully prebuilt kit, the owned layer means the monochrome-pro aesthetic isn't fighting a vendor's default theme.
- **Trade-off**: building the component layer is upfront work versus adopting a kit. Accepted — it's what makes the calm, exact aesthetic achievable, and CVA keeps the variant surface small.
- **Dark mode is deferred but not foreclosed.** Vars-on-`:root` means a future theme is values-only, no component changes.

## Alternatives considered

- **A prebuilt component kit (MUI / Chakra / Ant).** Rejected: each ships an opinionated visual theme that fights the near-monochrome pro aesthetic, and overriding it to the token system is more work than owning a thin layer over Radix.
- **shadcn/ui verbatim.** Close to this decision in spirit (Radix + Tailwind + CVA), but we keep the component layer **owned** and token-pinned to the design export rather than vendored as-is, so parity is exact.
- **Plain CSS / CSS Modules, no Tailwind.** Rejected: slower to build the dense, token-driven UI from a design export; Tailwind's utility + `@theme` token bridge is the fast path.
- **Headless UI instead of Radix.** Viable, but Radix's primitive coverage (Dialog, Popover, DropdownMenu, Tooltip) is broader for the overlays this UI needs.
