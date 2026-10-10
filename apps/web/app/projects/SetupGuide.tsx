// apps/web/app/projects/SetupGuide.tsx
import Link from "next/link";
import {
  Button,
  CommitSha,
  FileRef,
  RoleTag,
  VerdictCard,
  type Role,
} from "@zkcvp/design-system-ledger/components";

/**
 * The first-run empty state of /projects: the whole setup path on one screen.
 *
 * Nothing can be claimed until four things have happened across two accounts,
 * and on a first visit neither account can see the other's half. So the guide
 * is a map of who does what, laid out as lanes, rather than a checklist: a
 * stakeholder reading it needs to see that the repository is not theirs to
 * attach, and a developer needs to see that the project is not theirs to
 * create. The viewer's own steps are drawn in full ink and everything else is
 * context.
 *
 * Static on purpose. It describes the path; the pages it describes are where
 * the path is walked, and the empty list it replaces disappears the moment the
 * first project exists.
 */

type Lane = Role | "evaluator";

interface Step {
  n: string;
  lane: Lane;
  /** Desktop grid column, 1-based within the step columns. */
  col: number;
  title: string;
  body: string;
  /** Rendered beside the number, for steps that share a column. */
  note?: string;
}

const STEPS: Step[] = [
  {
    n: "01",
    lane: "stakeholder",
    col: 1,
    title: "Create a project",
    body: "Give it a name. You become its first stakeholder.",
  },
  {
    n: "02",
    lane: "stakeholder",
    col: 2,
    title: "Invite a developer",
    body: "Add them by GitHub username. They join the next time they sign in with GitHub.",
  },
  {
    n: "03",
    lane: "stakeholder",
    col: 3,
    note: "either order",
    title: "Write requirements",
    body: "A checklist of what must be true. Editing one makes a new version, so a verdict stays with the text it judged.",
  },
  {
    n: "03",
    lane: "developer",
    col: 3,
    note: "either order",
    title: "Attach repositories",
    body: "Picked from what the developer's own GitHub account can already see. Nothing to install.",
  },
  {
    n: "04",
    lane: "developer",
    col: 4,
    title: "Submit a claim",
    body: "Choose requirements and pin the exact commits that satisfy them.",
  },
  {
    n: "05",
    lane: "evaluator",
    col: 5,
    title: "Read the verdict",
    body: "The evaluator reads the code at those commits and records satisfied or not satisfied per requirement.",
  },
];

const LANES: { lane: Lane; row: number; how: string }[] = [
  { lane: "stakeholder", row: 1, how: "Signs in by email" },
  { lane: "developer", row: 2, how: "Signs in with GitHub" },
  { lane: "evaluator", row: 3, how: "Runs on each claim" },
];

function LaneTag({ lane }: { lane: Lane }) {
  if (lane === "evaluator") {
    return <span className="lg-chip lg-chip--role">Evaluator</span>;
  }
  return <RoleTag role={lane} />;
}

export function SetupGuide({ role }: { role: Role }) {
  return (
    <section className="app-guide" aria-labelledby="app-guide-title">
      <div className="app-guide__intro">
        <div className="app-guide__lede">
          <h2 id="app-guide-title" className="app-guide__title">
            No projects yet. Here is the path to a first verdict.
          </h2>
          <p className="app-guide__text">
            A project brings a stakeholder and a developer together around a
            private repository. The stakeholder writes what has to be true, the
            developer points at the commits that make it true, and an evaluator
            reads the code at those commits and records a verdict. The
            stakeholder never needs access to the repository.
          </p>

          {role === "stakeholder" ? (
            <div className="app-guide__action">
              <Link href="/projects/new">
                <Button type="button">Create your first project</Button>
              </Link>
              <span className="app-guide__hint">
                Then invite the developer who holds the code.
              </span>
            </div>
          ) : (
            <div className="app-guide__waiting">
              <p className="app-guide__waiting-title">
                Waiting on an invitation
              </p>
              <p className="app-guide__waiting-text">
                A stakeholder creates the project and adds you by your GitHub
                username. Sign in again once they have, and the project appears
                here.
              </p>
            </div>
          )}
        </div>

        <figure className="app-guide__example">
          <figcaption className="app-guide__example-caption">
            Example of what step 05 produces
          </figcaption>
          <VerdictCard
            requirementTitle="Sign in with GitHub"
            verdict="satisfied"
            rationale="The callback exchanges the authorization code for a token, rejects a request whose state does not match, and starts a session only after both succeed."
            footer={
              <>
                <FileRef path="src/auth/callback.ts" lines={[15, 42]} />
                <CommitSha
                  sha="4f9c2e1a7b3d8e605c2a91f0d4b7e3a1c6f8d2b0"
                  copyable={false}
                />
              </>
            }
          />
          <p className="app-guide__example-note">
            A verdict is the evaluator&rsquo;s judgment of the code, recorded
            as it was given. It is not a proof.
          </p>
        </figure>
      </div>

      <div className="app-guide__map">
        {LANES.map(({ lane, row, how }) => (
          <div
            key={lane}
            className="app-guide__lane"
            data-lane={lane}
            data-own={lane === role || undefined}
            style={{ "--row": row } as React.CSSProperties}
            aria-hidden="true"
          >
            <LaneTag lane={lane} />
            <span className="app-guide__lane-how">{how}</span>
          </div>
        ))}

        <ol className="app-guide__steps" aria-label="Setup steps">
          {STEPS.map((s) => {
            const own = s.lane === role;
            const row = LANES.find((l) => l.lane === s.lane)!.row;
            return (
              <li
                key={`${s.n}-${s.lane}`}
                className="app-guide__step"
                data-own={own || undefined}
                style={
                  { "--col": s.col + 1, "--row": row } as React.CSSProperties
                }
              >
                <div className="app-guide__step-head">
                  <span className="app-guide__step-n">{s.n}</span>
                  {own && <span className="app-guide__yours">Your step</span>}
                </div>
                {s.note && <span className="app-guide__step-note">{s.note}</span>}
                {/* The lane is the row on wide screens. Stacked, there is no
                    row to read it from, so each step names its own. */}
                <span className="app-guide__step-lane">
                  <LaneTag lane={s.lane} />
                </span>
                <h3 className="app-guide__step-title">{s.title}</h3>
                <p className="app-guide__step-body">{s.body}</p>
              </li>
            );
          })}
        </ol>
      </div>
    </section>
  );
}
