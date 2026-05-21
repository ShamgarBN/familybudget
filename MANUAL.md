# Niemann Family Finances — User Manual

A local-first family budgeting app. All data lives in your browser via
`localStorage`. No server, no account, no tracking.

---

## 1. Setup

### Prerequisites

- **Node.js 20.x or newer** (LTS recommended). Verify with `node -v`.
- **npm 10+** (ships with Node). Verify with `npm -v`.
- A modern browser (Chrome, Edge, Safari, Firefox).

### First-time install

```bash
cd "Family Budget"
npm install
```

This creates `node_modules/` (~250 MB) and a `package-lock.json`.

### Run in development

```bash
npm run dev
```

Opens at `http://localhost:5173` (or the next free port). Hot-reloads on file
saves.

### Build for offline use

```bash
npm run build      # outputs to ./dist
npm run preview    # serves the production build at http://localhost:4173
```

### Hosting it permanently (optional)

The build output in `./dist` is a fully static SPA — push it to any static
host:

- **GitHub Pages**: commit `dist` to a `gh-pages` branch.
- **Netlify / Vercel / Cloudflare Pages**: drop the `dist` folder.
- **Local-only**: serve `dist` with anything (e.g. `npx serve dist`).

### Installing the macOS app

The app can be packaged as a native macOS `.app` so a non-technical user just
double-clicks the icon — no terminal, no browser, no localhost. Build target is
Apple Silicon (M1 / M2 / M3 / M4), so it runs natively on a Mac Mini with a
silicon chip.

#### Build the app (one-time, on any Mac with the project checked out)

```bash
npm install        # if you haven't already
npm run dist:mac
```

This takes 1–2 minutes (the first run also downloads ~120 MB of Electron
runtime into your user cache). The build includes an ad-hoc signing step so
Apple Silicon Macs do not treat the app bundle as structurally invalid. When it
finishes, you get:

| Path | What it is |
| --- | --- |
| `release/Niemann Family Finances-<version>-arm64.dmg` | Drag-to-Applications installer (~120 MB). The thing you copy to her Mac. |
| `release/mac-arm64/Niemann Family Finances.app` | The unpacked app, for testing locally. |

#### Install on her Mac Mini

1. **Copy the `.dmg`** to her Mac (AirDrop, USB stick, shared folder — whatever's
  easiest).
2. **Double-click the `.dmg`**. A Finder window opens showing the app icon.
3. **Drag `Niemann Family Finances` into the `Applications` folder** in that
  same window.
4. Eject the disk image (right-click → Eject).
5. Open **Launchpad** and click the new icon. On the **very first launch**
  macOS will refuse to open it because we don't pay Apple's $99/year code-signing
  fee. To bypass this one time:
  - Open **Finder → Applications**.
  - **Right-click** (or Control-click) on `Niemann Family Finances`.
  - Choose **Open**.
  - In the dialog that warns "Apple could not verify…", click **Open** again.
  - macOS remembers the choice — every future launch is just a normal click.

Optional: drag the icon from `Applications` into the **Dock** so she has a
permanent one-click launcher.

If macOS says the app is **damaged** instead of offering the right-click
Open flow, make sure you are using a DMG built after version `1.0.1`. Earlier
test builds were unsigned, and Apple Silicon Macs can report unsigned app
bundles as damaged. Delete the old app from `Applications`, copy over the new
DMG, and install again.

#### Daily usage for her

- Click the icon in the Dock (or Launchpad).
- A single window opens with the budgeting app inside.
- Everything auto-saves as she types. Closing the window or quitting the app
  loses nothing.
- Cmd+Q quits. Cmd+W closes the window. Cmd+M minimizes.

#### Shipping updates

Her data lives in `~/Library/Application Support/Niemann Family Finances/`
(survives app updates) — **not** inside the `.app` itself.

To ship a new version:

1. Make changes on your dev Mac.
2. Bump `version` in `package.json` (e.g. `1.0.0` → `1.0.1`) so DMG filenames
  don't collide.
3. `npm run dist:mac`.
4. Copy the new `.dmg` to her Mac, drag the new app into `Applications` (Finder
  will ask to replace — say Replace), and open. Her household data is
  untouched.

If you ever want a totally fresh start, delete the
`~/Library/Application Support/Niemann Family Finances/` folder — that's where
the data file lives.

#### Backup hygiene

Because the data file is stored on a single Mac, treat backups seriously.
Inside the app: `⚙ Settings → ⬇ Download JSON backup`. A reasonable cadence is
weekly into iCloud Drive or any folder that's part of Time Machine.

### Moving to another computer

The project files and your data are separate.

1. **Project files** — copy the folder, run `npm install`, then `npm run dev`.
2. **Your data** — on the old machine, `⚙ Settings → ⬇ Download JSON backup`.
  Move the JSON file to the new machine, then `⚙ Settings → ⬆ Restore from JSON`.

Backups include accounts, categories, transactions, recurring rules, pay
periods, budgets, learned merchant rules, and settings.

---

## 2. The interface at a glance

```
┌─────────────────────────────────────────────────────────────┐
│  Header: title · account filters · search · ⌥ undo · ⚙     │
├──────────────────────────┬──────────────────────────────────┤
│   Spending Mix (donut)   │   Import / Export                │
│                          │   Recurring                      │
├──────────────────────────┴──────────────────────────────────┤
│   Ledger                                                    │
│   ├─ Pay period 1 (collapsible)                             │
│   │   ├─ Transactions table                                 │
│   │   └─ Budget breakdown                                   │
│   ├─ Pay period 2                                           │
│   └─ ...                                                    │
└─────────────────────────────────────────────────────────────┘
```

### Header

- **Title** + **Account filter pills** (All / Bank / Credit / Savings — multi-select).
- **Search** filters titles, memos, and category names.
- **Undo** — `⌘Z` / `Ctrl+Z` works too. 60-step history.
- **⚙ Categories** — manage categories, subs, emojis, colors.
- **⚙ Settings** — pay-period frequency, learned rules, backup/restore, PDF.

---

## 3. Adding transactions

### Manual entry

Click `+ Transaction` in the Ledger toolbar. Modal asks for:

- Date (defaults to today)
- Account (Bank / Credit / Savings)
- Title (auto-focused)
- Category (and Subcategory if available)
- Type — `+` Income, `−` Expense, `~` Neutral
- Amount (positive number; sign comes from Type)
- Memo (optional)

If the date doesn't fit any existing pay period, a new one is auto-created.

### CSV import

Drop a CSV onto **Import / Export → Bank Account / Credit Card / Savings**.

Supported formats:

- **Bank** — accepts `Date / Description / Amount / Running Bal.` style statements,
including ones with a metadata block at the top (e.g. Bank of America).
Handles parens-style negatives `(45.00)` and Debit/Credit two-column layouts.
- **Credit** — `Date / [Type /] Description / Merchant / Amount`. Positive
amount = charge (expense), negative = payment/refund (income).
- **Savings** — same shape as Bank.

Every imported row is auto-categorized using:

1. Your **trained merchant rules** (highest priority — see §7).
2. **Inferred history** from your existing transactions.
3. **Built-in keyword rules** (~80 patterns covering common merchants and bills).
4. Otherwise → **Other**.

The status line tells you how many rows landed in a real category and how many
came from your trained rules.

### Inline editing in the ledger

Every cell is editable in place. Click and type for title/memo, click and
choose for date/account/category/type/amount. Cleared and selection
checkboxes are stationary. Hover a row to reveal the **✂️ split** and **× delete**
buttons.

---

## 4. Pay periods

A pay period is just a `[start, end]` window. Transactions fall into whichever
period covers their date.

- **Add a new period**: `+ Pay period` in the Ledger toolbar — appended after
the last one with the configured frequency.
- **Edit a period**: click the 📅 in its header to change start/end and label.
- **Delete a period**: click the ✕ in its header. Transactions stay in the
ledger but lose their grouping.
- **Collapse/expand**: caret on the left of the header. Persisted across reloads.
- **⊞ Expand all / ⊟ Collapse all** in the toolbar.

The frequency for *new* periods is set in `⚙ Settings → Pay periods`:
weekly, bi-weekly, semi-monthly (1–15 / 16–end), or monthly. Existing
periods aren't rewritten when you change the setting.

The header shows **In / Out / Net / End** (running balance through the end of
this period, respecting any active account filter).

The bottom of each table includes a **Projected Remaining Budget** row
(italic, dashed, dark-green balance) showing what the ending balance would
be if every remaining budgeted dollar were spent. It's a forecast, not a
real transaction.

---

## 5. Categories and subcategories

Open the manager from the header → **⚙ Categories**.

- Each category has an **emoji**, **color**, and **name**, all editable inline.
- Tick **Allow subs** to enable subcategories on a category. By default only
**Bills** allows subs (Rent, Electric, Water, Internet, Phone, Insurance,
Subscriptions). You can flip the toggle on any other category if you want.
- **+ Add category** at the bottom of the modal.
- **Income** is special — it's the bucket that auto-receives import rows tagged
as income. You can rename it but not delete it.
- **Categories sort A–Z** in display, but operations key off stable IDs, so
renaming or reordering never moves the wrong item.

---

## 6. Budgets

Each pay period has its own independent budget. **No rollover** — last
period's leftover does not flow forward.

Open a period's `💰 Budget Breakdown` row to see one card per category.

- **Bar** — spent vs. effective budget. Turns red when over.
- **Override** input — sets a manual budget for this period.
- **Subcategory rows** (Bills only by default) — each gets its own budget,
bar, and override. The parent category's effective budget is the larger of
its own manual budget or the *sum* of its sub-budgets, whichever is higher.
Mark `⚡ auto = sum of subs` indicates the sum is winning.
- **Spending is account-agnostic** — toggling account filters in the header
doesn't change budget math.
- **Neutral (`~`) and income transactions don't count** as spending.

---

## 7. Auto-categorization & learning

Three layers stacked, highest priority first:

1. **Trained rules** — built automatically every time you change a
  transaction's Category in the ledger. One change is enough to redirect
   every future CSV row matching the same merchant signature.
2. **Inferred history** — for any merchant where ≥ 2 of your existing
  transactions share a category, that becomes a soft inference until
   overridden by a trained rule.
3. **Keyword rules** — ~80 merchant patterns shipped with the app
  (Wegmans/Kroger/Trader Joe's → Groceries, Shell/Exxon → Car & Driving,
   Netflix/Spotify → Bills > Subscriptions, etc.).

### Triggers

- **On every CSV import**, each row is run through the categorizer.
- **🪄 Auto-categorize** button on the Import card runs the categorizer over
*every* existing transaction. One undo step rolls it back. Useful after
training a few rules to retroactively fix old data.

### Asymmetric type correction

When Auto-categorize runs over existing data:

- It will flip a transaction from Expense → Income if the categorizer
strongly says Income (e.g. matched the `payroll` keyword) — useful for
cleaning up bad imports.
- It will **not** flip Income → Expense even if the suggested category is
non-Income. This protects legitimate refunds (Disney+ refund stays as Income).

### Auditing what the model has learned

`⚙ Settings → Learned merchant rules` shows every trained rule with:

- The merchant signature (e.g. `wegmans`)
- Where it routes (category + sub)
- Hit count and last-trained date
- An `×` to forget that one rule

Or **Clear all** to wipe the lot. Forgetting rules doesn't change any
transactions — it just stops biasing future categorization.

---

## 8. Recurring transactions

Add via the **Recurring** card. Frequencies: Weekly, Bi-weekly, Monthly,
Bi-annually, Yearly, Custom (every N days). Optional end date.

When you create or edit a rule, instances are generated forward up to **2
years** from today. Editing one instance's date in the ledger affects only
that one instance — not the whole series. Deleting the rule removes all
its future instances.

Recurring instances are flagged with a 🔄 in the title cell.

---

## 9. Splits

Hover a transaction → click **✂️**. Allocate the total across multiple
categories. The save button is disabled until splits balance to the
transaction total.

Splits show in the Category cell as colored mini-badges. Both the donut and
budget breakdown count each split part against its own category.

`Clear splits` returns the transaction to single-category mode.

---

## 10. Search & filters

- **Header search** — filters titles, memos, and category names across every
pay period in real time.
- **Account filter pills** — multi-select. Affects the donut, ledger
visibility, and the running-balance totals; *does not* affect budget math.
- **Donut legend** — click any item to filter the ledger to just that
category. Click again (or use the `Filter on • clear ×` pill in the header)
to clear.

---

## 11. Selection & bulk actions

- Each transaction has a **checkbox** on the left.
- The **table header checkbox** for each pay period selects/deselects every
transaction in that period (with an indeterminate state when only some are
checked).
- Selected counts appear as **Delete N** in the Ledger toolbar.

---

## 12. Keyboard shortcuts


| Shortcut        | Action                                                  |
| --------------- | ------------------------------------------------------- |
| `⌘Z` / `Ctrl+Z` | Undo (60-step history)                                  |
| `↑` / `↓`       | Move focus to the same cell in the prev/next ledger row |
| `Enter`         | Commit the current cell edit                            |
| `Esc`           | Close the open modal                                    |


---

## 13. Backup, restore, reset

`⚙ Settings`:

- **⬇ Download JSON backup** — full state in one file (accounts, categories,
transactions, recurring, pay periods, budgets, learned rules, settings).
- **⬆ Restore from JSON** — replaces current state. One undo step is preserved.
- **Reset all data** *(danger zone)* — wipes everything back to the defaults.
Take a backup first.

---

## 14. PDF report

`⚙ Settings → PDF report` — pick a pay period, click **Download PDF**. The
PDF includes the period summary (income / expenses / net), the budget table,
and the full transactions list for that period.

---

## 15. CSV export

**Import / Export → ⬇ Export CSV** dumps the entire ledger to a single CSV
sorted by date, with columns: Date, Account, Title, Category, Subcategory,
Type, Amount (signed), Memo, Cleared.

Useful for sharing data, opening in Excel/Numbers, or moving between two
copies of the app.

---

## 16. Where data lives

- **Browser localStorage**, key `nfm_v1`. Per browser, per profile, per device.
- Clearing your browser's site data deletes everything — back up first.
- Private/Incognito windows don't share storage with regular windows.
- The store auto-saves on every change. There is no manual "save."

---

## 17. Troubleshooting


| Symptom                                 | Try this                                                                                                                       |
| --------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------ |
| `npm install` fails on Node 18 or older | Upgrade to Node 20+                                                                                                            |
| Dev server says port in use             | Change `server.port` in `vite.config.ts` or close the other process                                                            |
| Import says "No rows detected"          | Check the CSV's first 8 rows — there must be a header line containing both a date keyword *and* an amount/debit/credit keyword |
| Transactions show as wrong type         | Re-import after the parser fix, or use 🪄 Auto-categorize, or flip Type cell manually                                          |
| App is empty after a browser update     | Open Settings → Restore from JSON if you have a backup; otherwise localStorage was wiped                                       |
| Trained the wrong rule                  | Settings → Learned merchant rules → click `×` next to it                                                                       |


---

## 18. Project layout (for developers)

```
Family Budget/
├── package.json, vite.config.ts, tailwind.config.js
├── tsconfig*.json, postcss.config.js
├── index.html
├── README.md, MANUAL.md
└── src/
    ├── main.tsx, App.tsx, index.css
    ├── types.ts                       data model
    ├── store/
    │   ├── store.ts                   Zustand + persistence + 60-step undo
    │   ├── defaults.ts                default categories / accounts / state
    │   └── selectors.ts
    ├── lib/
    │   ├── budget.ts                  spend/effective math
    │   ├── categorize.ts              keyword rules + history + trained rules
    │   ├── csv.ts                     bank/credit/savings parsers + export
    │   ├── dates.ts, payPeriods.ts    pay-period generation
    │   ├── pdf.ts                     PDF report
    │   └── recurring.ts               2-year recurring instance generator
    ├── components/
    │   ├── Header, DonutCard, ImportCard, RecurringCard
    │   ├── Ledger, PayPeriodSection, TransactionRow
    │   ├── TransactionModal, SplitModal, RecurringModal
    │   ├── CategoryManagerModal, SettingsModal
    │   └── ui/                         Modal, Money, EmojiPicker
    └── hooks/useGlobalKeys.ts          ⌘Z undo + ↑↓ row navigation
```

