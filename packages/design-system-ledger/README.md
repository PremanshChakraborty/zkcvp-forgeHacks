# ZKCVP · Ledger

The visual language for the ZKCVP domain. Tokens, a plain-CSS component layer,
React (TSX) components, a runnable gallery, and hand-written specimen pages.
No app pages: this is vocabulary, not screens.

**Direction: the record, not the terminal.** Ledger reads like a countersigned
document: light-first, high-contrast ink on paper, square ruled structure, a
real measure for prose, and a compact density *context* for the developer's
data surfaces rather than compactness as the default. It puts the shared
artifact, the report a stakeholder has to trust, at the visual centre.

**`components/types.ts` is the UI-facing source of truth for the domain
enums.** It mirrors the database enums in `docs/plans/01-requirement-management.md`.
`@zkcvp/contracts` carries its own copy of the same unions for non-UI consumers
(the API layer and the Evaluator); the two have no compile-time link, so
`packages/contracts/tests/enum-parity.test.ts` asserts textually that they
agree. If they ever diverge, one surface is telling a user something the other
is not — fix `@zkcvp/contracts` to match this file.

An earlier visual direction (`design-system/`, a darker "forensic terminal"
language) was explored and has been removed; Ledger was a strict superset of it,
so nothing was lost. Some notes below still contrast the two where the
comparison explains *why* a decision was made — those are design rationale, not
a live dependency.

---

## Seeing it

Two ways, and they render the same stylesheet, so what one shows the other shows.

**Hand-written specimen pages, no build step.** Open
`previews/index.html` in a browser. These are raw markup using only `lg-`
classes, which makes them a real test of the CSS rather than a mock-up of it.
Every page carries a first-line `@dsCard` marker naming its group.

**The React gallery.** Renders the actual TSX components. This is the surface to
check when changing a component rather than a class.

```bash
cd design-system-ledger
npm install
npm run dev        # gallery at http://localhost:5173
npm run verify     # typecheck + render check
```

Both carry a theme switch (OS / light / dark) and a density switch
(comfortable / compact) that changes every specimen on the page at once.

### The render check

`npm run check` server-renders every gallery section and asserts things about the
resulting markup. It exists because a typecheck proves the components compile and
a build proves the graph resolves, and neither proves the thing that actually
matters here: that the rules below hold in output a user would see. Each
assertion in `checks/render-check.tsx` maps to one documented rule, so a failure
means the component regressed, not that the assertion needs relaxing. It
currently asserts, among others, that no status chip ever contains the string
`eval_failed`, that a valid inclusion proof never renders in the satisfied
colour, that no progressbar declares `aria-valuenow`, and that every icon-only
button has an accessible name.

---

## Layout

```
design-system-ledger/
├── styles/
│   ├── ledger.css          ← single entry point; import this
│   ├── fonts.css           ← Geist via @import. Replace in the app. See "Fonts"
│   ├── tokens.css          ← every colour/size/duration value in the system
│   ├── base.css            ← reset, document defaults, typography, layout helpers
│   ├── components.css      ← generic UI
│   ├── domain.css          ← ZKCVP-specific UI
│   └── responsive.css      ← breakpoints, pointer/hover modality, print; loads last
├── components/             ← React wrappers over the CSS above
│   ├── index.ts            ← import from here, never from individual files
│   ├── types.ts            ← domain enums, labels, and the log caveat text
│   └── icons.tsx           ← the Phosphor family, pinned in one place
├── gallery/                ← React specimen pages
├── previews/               ← hand-written HTML specimen pages, no build step
├── checks/                 ← render check; asserts the domain rules in markup
└── preview-app/
    ├── index.html, src/    ← Vite harness for the gallery
    └── next-adapter/       ← drop-in App Router layout.tsx + page.tsx
```

---

## React and Next

The component layer is framework-free React. It imports nothing from `next/*`,
so the same files work in both, and the split is the standard one:

- Components with state or event handlers carry `"use client"` already.
- Purely compositional components (`Card`, `Table`, `Timeline`) do not, so a
  Server Component page can render them without pulling a client boundary in.
- `icons.tsx` is a client module, because `IconContext.Provider` is a context
  provider. Wrap the app once in `<LedgerIcons>` to set the icon size and weight
  globally; without it, icons fall back to Phosphor's defaults and still render.

### Next.js App Router

Copy `preview-app/next-adapter/layout.tsx` to `app/layout.tsx` and
`preview-app/next-adapter/page.tsx` to `app/ledger/page.tsx`. The layout does the
whole integration in one place: it imports `ledger.css` once at the root and
points `--lg-font-sans` and `--lg-font-mono` at `next/font` variables.

### Path alias

The app does not exist yet. When it is scaffolded, add to `tsconfig.json`:

```json
{ "compilerOptions": { "paths": { "@/*": ["./*"] } } }
```

### Dependencies

The **CSS layer has no dependencies at all**: no Tailwind, no build step, no
runtime. The **component layer** needs `react` and `@phosphor-icons/react`:

```bash
npm install @phosphor-icons/react
```

Icons are always passed in as markup, never required by a class, which is why the
hand-written preview pages can use Phosphor's web build from a CDN instead and
still render the real components' shapes.

### Fonts

`styles/fonts.css` pulls Geist over `@import` so `previews/*.html` render the real
typeface with no build step. **It should not ship.** An `@import` in a stylesheet
blocks render and cannot be preloaded, which costs LCP. Two supported swaps:

1. **next/font** (preferred). Already wired in the Next adapter layout.
2. **Self-hosted `@font-face`** with `font-display: swap`, if the app is not Next.

Either way, delete the `fonts.css` line from `ledger.css` or override the two
family tokens. The fallback stacks in `tokens.css` are real: if the import is
removed and nothing replaces it, the system renders in `system-ui` and
`ui-monospace` at the same sizes and still looks deliberate.

---

## Token rules

1. **No raw hex outside `tokens.css`.** Component CSS reads custom properties
   only.
2. **No exposed neutral ramp.** There is deliberately no `--lg-ink-600`. Only
   semantic names (`--lg-text-secondary`, `--lg-rule`) exist, because a ramp read
   directly by components cannot be inverted for dark mode without auditing every
   call site.
3. **Two surfaces and a well, not a four-step ramp.** Structure comes from rules
   and typographic weight, so stacked surface tints are not needed to separate
   regions. What remains is the one distinction that is semantically load-bearing:
   `--lg-well` is *darker* than the canvas. Cards sit above the page and hold
   chrome; wells are cut into it and hold evidence. This is the only surface rule
   carried over from the first direction unchanged.
4. **The type scale is numeric and in `rem`.** `--lg-text-50` … `--lg-text-800`,
   so "is 400 bigger than 300" is never a question, and a reader who raises their
   browser's base font size gets a system that grows with them. 300 is the default
   UI size; 400 is the reading size and appears only where there are real
   sentences. 800 is a display tier the first direction did not have, because a
   verdict headline is the largest fact on a stakeholder's screen.
5. **Density is a context, not a pair of row tokens.** The first direction shipped
   `--ds-row-dense` and `--ds-row-comfy` side by side and every component had to
   pick one. Here the comfortable values are the default and
   `[data-density="compact"]` re-points the same tokens, so a commit table can be
   dense inside a page that is not.
6. **Shape is square.** Surfaces and controls have no radius; only chips and
   avatars are round. There is no middle radius to get wrong, and it is what makes
   a shared-edge button group a one-line negative margin.
7. **Elevation is for things that float.** One shadow token, used by toasts and
   popovers only. Cards and wells are bounded by rules, never lifted.
8. **Width and input modality are separate questions.** `responsive.css` adapts at
   960px and 640px, and handles `pointer: coarse` and `hover: none`
   *independently* of width. A touch laptop is wide and coarse; a landscape phone
   is narrow with no hover. Conflating them is what leaves affordances
   unreachable.
9. **Loading indicators slow under reduced motion; they never stop.**
   `--lg-dur-indicator` is separate from the interaction durations for exactly
   this reason. Freezing a spinner makes a request that is genuinely still running
   look hung, which misinforms rather than accommodates. Purely decorative motion
   (the skeleton shimmer) stops outright.

---

## Colour decisions

### One colour, one meaning

| Token | Hue | Means |
|---|---|---|
| `--lg-accent` | ink blue | Interactive only: actions, links, focus, active nav |
| `--lg-satisfied` | green | `verified` / verdict `satisfied` |
| `--lg-unsatisfied` | **ink** | `eval_failed` / verdict `not_satisfied`, a real result |
| `--lg-danger` | red | True errors and irreversible destructive actions |
| `--lg-neutral` | grey | `new`, never evaluated |
| `--lg-warning` | ochre | Approaching a limit. Never a result |
| `--lg-role-*` | **none** | Who someone is |

### Why the accent is blue

Amber is a light fill. It needed a separate value for text and for backgrounds in
*both* themes, and white on amber computes to about 2:1 and fails WCAG 1.4.11 at
any size, so the first direction had to bake a near-black checkbox tick. This blue
clears 7.6:1 as text on paper *and* as a fill under white text, so light mode
needs one accent value and the system needs one tick glyph. Blue also frees the
verdict family from having to avoid it.

### Why `not_satisfied` has no hue

The first direction gave it periwinkle so it would not read as an error, which
worked. Ledger removes the hue entirely and renders it as a **solid ink chip**.
Three reasons:

1. It cannot be misread as an error, because there is no hue to sit near red.
2. It survives greyscale and colour-blind rendering without the text label being
   the only differentiator.
3. It is honest about weight. A negative verdict is the most emphatic recorded
   fact on the page, so it is set in ink rather than in a soft pastel.

`new` stays hollow and quiet, so "recorded negative" and "never assessed" read as
opposites at a glance instead of as two similar cool greys.

### Why `warning` is its own hue here

The first direction aliased `warning` to the accent, which was safe *because the
accent was already amber*. Ledger's accent is blue and blue does not read as
caution, so it carries a real sixth slot. It is safe for the same underlying
reason: ochre is not a verdict colour, so an ochre "approaching the request time
limit" clock cannot be read as a result. Anything that has actually failed uses
`danger`.

### Why roles lost their colour

Stakeholder and developer were blue and slate. Blue is now the accent, so they
could not keep it, and dropping hue turned out to express the underlying rule more
strongly than any pair of colours did: **who someone is must never be confused
with what an evaluation concluded**, so identity is the one thing in this system
that is never coloured. The two roles are separated by fill weight and by glyph.

### No coloured edges, ever

No surface gets a coloured left border, side tab or accent band to encode state.
Tone is carried by chips, icons, tinted backgrounds, tinted hairlines and words. A
2px coloured band down one side of a card is the most recognisable
machine-generated tell in this class of interface. The one full-strength rule in
the system, `--lg-rule-ink`, sits under headings, is typographic, and carries no
state.

---

## Domain rules the components encode

Each of these exists because the alternative would show a user something false.

### `eval_failed` means "not satisfied", not "something broke"

Per `docs/plans/01-requirement-management.md`, the transition table maps a
satisfied verdict to `verified` and a **not-satisfied verdict** to `eval_failed`.
The column name reads like an error; it is not one.

- `StatusBadge` renders it as **"Not satisfied"** in solid ink. The raw enum name
  never reaches a screen: `REQUIREMENT_STATUS_LABEL` in `types.ts` is the only
  place the mapping lives.
- Genuine infrastructure failures (rate limit, evaluator crash, blown execution
  ceiling) use `SystemErrorBadge` and `Alert tone="danger"` in **red, never ink**.
  They say nothing about whether the code satisfies the requirement.
- `IconUnsatisfied` is a prohibition sign, not a cross. A cross is the universal
  glyph for "error", "close" and "wrong input", and this is none of those.

### `new` is neutral, not amber

Never having been evaluated is an absence of information, not a caution.

### `archived` is not a status

`requirements.archived_at` and `requirement_versions.status` are orthogonal. A
requirement can be archived whatever its verification history, and archiving says
nothing about whether it was ever verified, so an archived row dims its title and
keeps its badge at full strength. Its chip is dashed rather than tinted, so it
cannot read as a fourth verdict. `RequirementDisplayStatus` folds the two together
**for display only**, because a row shows one badge at a time. Never persist it.

### Effective status is always derived

The status a row displays is its *current version's* status, resolved through
`requirements.current_version_id` at read time. Plan 01 forbids storing it on the
requirement; components take it as a prop and assume it came from a join.

### Sealed is not unverifiable

`EvidenceLock` withholds the bundle's contents **and keeps the verify action
live**, as a real secondary button rather than a greyed-out hint. Checking that
evidence was never altered and disclosing what it says are separate operations,
and the first never requires the second. Removing that button because the bundle
is private would collapse the distinction the trust model rests on.

### An intact record is not a correct judgment

`LogRef` is the most dangerous component in the product. An inclusion proof shows
the record was not quietly altered after it was written, and says nothing about
whether the judgment was correct. Two things enforce that:

- The caveat is **not an optional prop**. It comes from `LOG_REF_CAVEAT` keyed by
  state, so no call site can render the component without the sentence.
- A valid proof renders in **plain ink, never the satisfied green**. Reusing the
  verdict colour would fuse the two claims.

### Rationales are prose, never code

The Evaluator is constrained at generation time never to emit verbatim source; it
may cite a path or a line range, which is what `FileRef` is for. `VerdictCard`
styles the rationale as prose at a 66-character measure, so a leak would render as
visibly wrong. **That is a weak free signal, not a filter.** Filtering code out of
already-generated text is unreliable, which is why the constraint lives in the
agent's output step.

### Never fake a progress percentage

Evaluation runs synchronously inside the request that submits the claim, so the
developer's own tab is held open for its full duration. `EvaluationProgress` uses
an indeterminate bar, because there is no honest fraction for an LLM evaluation,
and turns the elapsed clock ochre past 70% of `ceilingSeconds`, so the developer
is warned *before* the request is cut off rather than after.

`ChecklistProgress` does show a real fraction, and draws one segment per
requirement rather than a filled bar: a bar implies a single ordered quantity, and
a checklist is a set of independent outcomes, so three negatives is not "60%
done".

### The undo window is the whole reversible window

Repo attachment is permanent once the 60-second window closes: plan 02 has no
detach endpoint and no soft-delete state. `UndoToast` draws a live countdown ring
with the seconds printed inside it, because the remaining time has to be legible
at a glance rather than inferred from a fading toast.

### Truncate hashes in the middle

Comparing a digest by eye means comparing head *and* tail, so `HashRef` clips the
middle. `CommitSha` truncates from the front instead, because a git abbreviation
is conventionally leading characters and a developer recognises their own commit
by its first seven. Full values stay in `title` and in the copy payload.

### Dates are absolute, never relative

A claim pins specific commits and a verdict attaches to that exact state, so every
date is a fact about the record rather than about when the page loaded. "3 days
ago" silently changes meaning between the render and the screenshot someone pastes
into a thread.

### Language stays relationship-neutral

A stakeholder may be an agency's client, a non-technical internal manager, an
investor or someone funding a bounty. Any word that presumes which one breaks the
other three.

---

## Accessibility

- One focus treatment everywhere: 2px solid accent ring, 2px offset,
  keyboard-only via `:focus-visible`. No `border-radius` override in that block,
  so the ring inherits whatever shape the element already has.
- Status is never colour alone. Every chip pairs its tone with a text label, and
  the dot-only variant carries `aria-label` plus `title`.
- The focus ring colour differs between themes on purpose: the dark-mode fill blue
  is only 2.4:1 against the dark canvas and would fail WCAG 1.4.11, so the ring
  uses the label blue there.
- Text tones are contrast-checked against their own surfaces in both themes.
  `--lg-text-faint` is under 3:1 by design and is documented as non-essential-only.
- `IconButton` requires a `label`; `Table` requires a `label`; `Tabs` requires a
  `label`. An unnamed icon control or table is a wall of nothing to a screen
  reader, so there is no way to omit it.
- Tabs implement the ARIA pattern: only the selected tab is in the tab order and
  arrow keys move between them.
- Interaction motion collapses to `0ms` under `prefers-reduced-motion`. Indicators
  slow instead. The shimmer stops.
- Coarse pointers get 44px hit areas via a transparent overlay, so the control
  keeps its ruled alignment while the target grows. `hover: none` makes
  hover-revealed affordances permanently visible.
- Inputs go to 16px on coarse pointers, so iOS Safari does not zoom the viewport
  on focus.
- Wide content scrolls inside `.lg-scroll-x`; the page body never scrolls
  sideways.
- `responsive.css` carries a print block, because a verdict report is a thing
  people will export to PDF for whoever is paying for the work. The log caveat is
  forced to full-strength ink there: it is the sentence most likely to be quoted
  back.

---

## Specimen data

The gallery and preview pages use a fictional project (`kestrel-labs/attest-api`)
with plausible commit subjects and real-shaped digests. Nothing invents a
customer, a metric, a benchmark, an endorsement or a deployment claim, and **no
rationale shown anywhere is presented as real Evaluator output.** The Evaluator
does not exist yet. They are shapes for real content to land in.

---

## Not built yet

Deliberately absent until a real page needs them, so their API is shaped by a real
caller rather than guessed: modal/dialog, dropdown menu, date picker, pagination,
command palette, and the repo/branch picker composite for the attach flow.
