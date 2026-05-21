# Niemann Family Finances

A local-first family budgeting app. All data lives on your computer (browser
`localStorage` for the web build, `userData/` for the desktop build) — no
server, no account, no tracking.

**Current release:** `v1.1.0` — see
[Releases](https://github.com/ShamgarBN/familybudget/releases) for the signed
macOS Apple-Silicon `.dmg`.

## What's new in 1.1.0

- **Performance** — fixed the 4–7 s typing lag in the ledger by moving rows to
  controlled inputs + `React.memo`, and stopped persisting the full state on
  every search keystroke or filter toggle.
- **Recurring transactions** — manual edits to a generated instance are now
  *durable* (per-field `overrides`); rule edits propagate to non-overridden
  fields. New per-rule **Pause** and per-instance **Skip**, plus a click-to-revert
  ✎ override badge.
- **Transfers & credit cards** — neutral `Transfer` and `Credit Card` categories
  that move money between accounts without polluting income/expense totals; new
  **Recurring transfer** template that creates the matched out/in pair.
- **Budgeting & projections** — every pay period now shows a **rolling
  projected balance** in the header (rolls forward across all future months);
  Budget Breakdown stretches Bills horizontally with alphabetized subs and
  splits "Christmas" and "Transfer" into separate boxes.
- **Insights** — donut chart now drills into Bills subcategories; new
  12-month **Trends + Budget vs. Actual variance** card.
- **Reconciliation** — new ⚙ Settings → "Reconcile against statement" flow
  for matching cleared totals to a bank statement.
- **Search operators** — `amount:>50`, `category:Bills`, `account:"Bank Account"`,
  `cleared:no`, `flagged:yes`, `before:2026-04-01`, `after:2026-01-15`,
  `type:expense`.
- **Bulk actions** — multi-select rows in the ledger to set category / cleared /
  date / account or delete in one shot.
- **Per-account starting balance** in Settings (anchors running balances when
  you import partial history).
- **Keyboard** — ⌘N new transaction · ⌘F focus search · ⌘, settings · ⌘Z undo.
- **Dark mode** — light · dark · follow-system, in Settings.
- **Daily auto-backup** — rolling 14-day local snapshots, restorable from
  Settings, plus a `schemaVersion` migration ladder so older data upgrades
  safely.
- **Custom date picker** — type "today", `5/15/26`, or pick from a calendar
  without arrow keys ever bumping the underlying date.
- **Desktop polish** — single-instance lock, persisted window position/size,
  external links open in the default browser.
- **Tests** — Vitest unit tests for `budget`, `categorize`, `recurring`.

See [`MANUAL.md`](./MANUAL.md) for the full feature reference.

## Quick start (web / dev)

Requires **Node.js 20.x or newer**.

```bash
npm install
npm run dev      # http://localhost:5173
```

For production:

```bash
npm run build    # writes ./dist
npm run preview  # serves the production build at http://localhost:4173
```

Run the tests:

```bash
npm test         # one-shot
npm run test:watch
```

## Install the macOS desktop app

The non-techy path: download the latest `.dmg` from
[Releases](https://github.com/ShamgarBN/familybudget/releases), drag the app
into `Applications`, then double-click. Apple-Silicon (M1/M2/M3/M4) only.

The DMG is **ad-hoc code-signed**, not notarised. The first launch may need a
right-click → *Open* to bypass Gatekeeper. See
[`MANUAL.md → "Installing the macOS app"`](./MANUAL.md#installing-the-macos-app)
for the full handoff workflow.

To rebuild the DMG yourself:

```bash
npm run dist:mac
# → release/Niemann Family Finances-<version>-arm64.dmg
```

## Moving your data between computers

The app folder and your **data** are separate. To carry data between machines:

1. Open the app → ⚙ Settings → **Download JSON backup**.
2. Move the file to the new machine.
3. Open the app there → ⚙ Settings → **Restore from JSON**.

A rolling 14-day local auto-backup is also kept; you can restore from those
in the same Settings panel.

## Stack

- React 18 + TypeScript + Vite
- Tailwind CSS (CSS-variable themed for dark mode)
- Zustand with `localStorage` persistence + 30-step undo + schema-version
  migration ladder
- Chart.js (`react-chartjs-2`) for the donut and trends/variance cards
- jsPDF + `jspdf-autotable` for per-period and date-range PDF reports
- PapaParse for CSV import / export
- `date-fns` for pay-period math
- Electron 42 + `electron-builder` for the desktop bundle (ad-hoc signed)
- Vitest for unit tests

## License

Private / family use.
