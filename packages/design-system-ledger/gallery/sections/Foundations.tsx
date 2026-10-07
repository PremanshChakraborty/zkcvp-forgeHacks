import { Spec } from "../Spec";
import { Badge, RoleTag, StatusBadge, StatusDot, VersionPill } from "../../components";

/** Colour specimens read the live custom property, so they cannot drift. */
function Swatch({
  token,
  role,
}: {
  token: string;
  role: string;
}) {
  return (
    <div className="gx-swatch">
      <div
        className="gx-swatch__chip"
        style={{ background: `var(${token})` }}
      />
      <span className="gx-swatch__name">{token}</span>
      <span className="gx-swatch__role">{role}</span>
    </div>
  );
}

/** [token, "size / line-height", role, weight, tracked as display] */
const TYPE_SCALE = [
  ["--lg-text-800", "36 / 40", "display, one per page", 600, true],
  ["--lg-text-700", "28 / 34", "page title", 600, true],
  ["--lg-text-600", "21 / 28", "section heading", 600, false],
  ["--lg-text-500", "17 / 26", "card and verdict title", 600, false],
  ["--lg-text-400", "15 / 24", "prose, the reading size", 400, false],
  ["--lg-text-300", "14 / 22", "default UI", 400, false],
  ["--lg-text-200", "13 / 20", "compact body, metadata", 400, false],
  ["--lg-text-100", "12 / 18", "caption, help text", 400, false],
  ["--lg-text-50", "11 / 16", "uppercase micro-label", 500, false],
] as const;

const SPACE_SCALE = [
  ["--lg-space-1", 4],
  ["--lg-space-2", 8],
  ["--lg-space-3", 12],
  ["--lg-space-4", 16],
  ["--lg-space-5", 24],
  ["--lg-space-6", 32],
  ["--lg-space-7", 48],
  ["--lg-space-8", 64],
] as const;

export function Foundations() {
  return (
    <>
      <Spec
        name="Surfaces"
        api="--lg-canvas · --lg-surface · --lg-well"
        note="Two surfaces and a well, rather than a four-step ramp. The well is deliberately darker than the canvas in both themes: cards sit above the page and hold chrome, wells are cut into it and hold evidence. Keeping those opposed is what makes 'this is data the system actually read' legible."
        layout="block"
      >
        <div className="gx-swatches">
          <Swatch token="--lg-canvas" role="the page" />
          <Swatch token="--lg-surface" role="cards, panels, bars" />
          <Swatch token="--lg-well" role="evidence, digests, commit lists" />
          <Swatch token="--lg-hover" role="row and control hover" />
        </div>
      </Spec>

      <Spec
        name="Accent"
        api="--lg-accent · --lg-accent-solid"
        note="Ink blue, and interactive affordances only: actions, links, focus, active nav. It sits outside the verdict family so it can never be mistaken for a result. In light mode both tokens hold the same value, because this blue clears 7.6:1 as text on paper and as a fill under white text. Only dark mode has to split them."
        layout="block"
      >
        <div className="gx-swatches">
          <Swatch token="--lg-accent" role="text, icons, links" />
          <Swatch token="--lg-accent-solid" role="filled backgrounds" />
          <Swatch token="--lg-accent-subtle" role="selected row, info alert" />
          <Swatch token="--lg-accent-rule" role="hairline on tinted surfaces" />
        </div>
      </Spec>

      <Spec
        name="Verdict family"
        api="--lg-satisfied · --lg-unsatisfied · --lg-danger · --lg-neutral"
        note="Four meanings that must never share a hue. The negative verdict is rendered in ink rather than given a colour: it cannot then sit near the red reserved for things that actually broke, it survives greyscale, and it is honest about weight, since a negative verdict is the most emphatic recorded fact on the page."
        layout="block"
      >
        <div className="gx-swatches">
          <Swatch token="--lg-satisfied" role="verified · satisfied" />
          <Swatch token="--lg-unsatisfied" role="eval_failed · not_satisfied" />
          <Swatch token="--lg-danger" role="rate limit, crash, blown ceiling" />
          <Swatch token="--lg-neutral" role="new · never evaluated" />
          <Swatch token="--lg-warning" role="approaching a limit. never a result" />
          <Swatch token="--lg-archived" role="archived. orthogonal to status" />
        </div>
      </Spec>

      <Spec
        name="Status renditions"
        api="StatusBadge · StatusDot · VersionPill · RoleTag"
        note="Status is never colour alone: every chip pairs its tone with a text label, and the dot-only variant carries aria-label and title. Note that 'Not satisfied' is what eval_failed renders as. The raw enum name never reaches a screen, because a user reading 'failed' would conclude their evaluation broke when in fact it completed and disagreed."
      >
        <StatusBadge status="new" />
        <StatusBadge status="verified" />
        <StatusBadge status="eval_failed" />
        <StatusBadge status="archived" />
        <span className="lg-row-flex">
          <StatusDot status="new" />
          <StatusDot status="verified" />
          <StatusDot status="eval_failed" />
          <StatusDot status="archived" />
        </span>
        <VersionPill version={3} current />
        <VersionPill version={2} />
        <RoleTag role="stakeholder" />
        <RoleTag role="developer" />
      </Spec>

      <Spec
        name="Generic chips"
        api=".lg-chip--*"
        note="Prefer the status-aware wrappers above wherever one fits. These exist for the cases the domain enums do not cover."
      >
        <Badge>Neutral</Badge>
        <Badge tone="accent">Accent</Badge>
        <Badge tone="satisfied">Satisfied</Badge>
        <Badge tone="unsatisfied">Unsatisfied</Badge>
        <Badge tone="warning">Warning</Badge>
        <Badge tone="danger">Danger</Badge>
        <Badge tone="archived">Archived</Badge>
      </Spec>

      <Spec
        name="Type scale"
        api="Geist · --lg-text-50 … --lg-text-800"
        note="Numeric, so 'is 400 bigger than 300' is never a question, and in rem, so a reader who raises their browser's base font size gets a system that grows with them. 300 is the default UI size. 400 is the reading size and appears only where there are real sentences: evaluator rationales and requirement descriptions."
        layout="block"
      >
        {TYPE_SCALE.map(([token, size, role, weight, display]) => (
          <div className="gx-typerow" key={token}>
            <span className="gx-typerow__meta">
              {token.replace("--lg-text-", "")} · {size}
            </span>
            <span
              className="gx-typerow__sample"
              style={{
                fontSize: `var(${token})`,
                lineHeight: `var(${token}-lh)`,
                fontWeight: weight,
                letterSpacing: display
                  ? "var(--lg-tracking-display)"
                  : "var(--lg-tracking-tight)",
              }}
            >
              Independent machine attestation over real source
            </span>
            <span className="gx-typerow__meta">{role}</span>
          </div>
        ))}
      </Spec>

      <Spec
        name="Monospace"
        api="Geist Mono · tabular-nums"
        note="Every identifier a person might paste into a terminal, and every number. Tabular figures are the document-wide default rather than an opt-in: comparing two digests by eye only works when the glyphs line up in columns."
        layout="block"
      >
        <div className="lg-mono" style={{ fontSize: "var(--lg-text-300)" }}>
          4f2c9ab · sha256:9f3ac1…7be204 · src/evaluator/graph.ts:118-146
        </div>
        <div
          className="lg-mono lg-text-muted"
          style={{ fontSize: "var(--lg-text-300)", marginTop: "var(--lg-space-2)" }}
        >
          0123456789 · 1111111111 · 0000000000
        </div>
      </Spec>

      <Spec
        name="Space scale"
        api="--lg-space-1 … --lg-space-8"
        note="A 4px scale, in rem. 4 · 8 · 12 · 16 · 24 · 32 · 48 · 64."
        layout="block"
      >
        <div className="gx-scalebar">
          {SPACE_SCALE.map(([token, px]) => (
            <span className="gx-scalebar__item" key={token}>
              <span
                className="gx-scalebar__bar"
                style={{ width: `var(${token})` }}
              />
              <span className="gx-scalebar__name">{px}</span>
            </span>
          ))}
        </div>
      </Spec>

      <Spec
        name="Shape"
        api="--lg-radius · --lg-radius-pill"
        note="Square. The rule is that surfaces and controls have no radius and only chips and avatars are round, so there is no middle radius to get wrong and no decision to make per component. It is also what makes a shared-edge button group a one-line negative margin."
      >
        <span
          style={{
            display: "grid",
            placeItems: "center",
            width: "5rem",
            height: "3rem",
            background: "var(--lg-surface)",
            border: "1px solid var(--lg-rule-strong)",
            borderRadius: "var(--lg-radius)",
            fontSize: "var(--lg-text-100)",
          }}
        >
          surface
        </span>
        <Badge tone="accent">chip</Badge>
      </Spec>

      <Spec
        name="Rules"
        api="--lg-rule · --lg-rule-strong · --lg-rule-ink"
        note="Three weights, three jobs. The ink rule is this direction's signature and appears only under a page or section heading. It is typographic and carries no state: no surface in this system gets a coloured edge or side tab to encode status, because an accent band down one side of a card is the most recognisable machine-generated tell in this class of interface."
        layout="block"
      >
        <div style={{ display: "grid", gap: "var(--lg-space-4)" }}>
          <span>
            <span className="lg-caption">--lg-rule</span>
            <div style={{ borderTop: "1px solid var(--lg-rule)" }} />
          </span>
          <span>
            <span className="lg-caption">--lg-rule-strong</span>
            <div style={{ borderTop: "1px solid var(--lg-rule-strong)" }} />
          </span>
          <span>
            <span className="lg-caption">--lg-rule-ink</span>
            <div style={{ borderTop: "1px solid var(--lg-rule-ink)" }} />
          </span>
        </div>
      </Spec>

      <Spec
        name="Density context"
        api='[data-density="compact"]'
        note="Density is a context attribute rather than a pair of fixed row tokens. The comfortable values are the default and the compact context re-points the same tokens, so a commit table can be dense inside a page that is not, and no component needs to know which mode it is in. Switch the toggle in the header to see every specimen on this page move."
        layout="block"
      >
        <table className="lg-table">
          <thead>
            <tr>
              <th>Token</th>
              <th>Comfortable</th>
              <th>Compact</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td className="lg-table__cell--mono">--lg-row</td>
              <td>44px</td>
              <td>32px</td>
            </tr>
            <tr>
              <td className="lg-table__cell--mono">--lg-control-md</td>
              <td>34px</td>
              <td>30px</td>
            </tr>
            <tr>
              <td className="lg-table__cell--mono">--lg-text-base</td>
              <td>14px</td>
              <td>13px</td>
            </tr>
            <tr>
              <td className="lg-table__cell--mono">--lg-page-pad</td>
              <td>24px</td>
              <td>16px</td>
            </tr>
          </tbody>
        </table>
      </Spec>

      <Spec
        name="Motion"
        api="--lg-dur-1/2/3 · --lg-dur-indicator"
        note="Interaction durations are 80, 140 and 200ms and drop to zero under prefers-reduced-motion. The indicator duration is separate and only slows, because freezing a spinner or an indeterminate bar makes a request that is genuinely still running look hung, which misinforms rather than accommodates. Purely decorative motion, meaning the skeleton shimmer, stops outright."
        layout="block"
      >
        <dl className="lg-dl">
          <dt>--lg-dur-1</dt>
          <dd>80ms · tone and colour changes on hover</dd>
          <dt>--lg-dur-2</dt>
          <dd>140ms · entering and leaving elements</dd>
          <dt>--lg-dur-3</dt>
          <dd>200ms · larger layout reveals</dd>
          <dt>--lg-dur-indicator</dt>
          <dd>1100ms, and 2600ms under reduced motion. Never zero.</dd>
        </dl>
      </Spec>
    </>
  );
}
