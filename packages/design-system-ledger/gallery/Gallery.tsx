"use client";

import { useEffect, useState } from "react";
import {
  Button,
  ButtonGroup,
  LedgerIcons,
  NavItem,
  PageHeader,
  SideNav,
  SideNavSection,
} from "../components";
import { Foundations } from "./sections/Foundations";
import { Controls } from "./sections/Controls";
import { Containers } from "./sections/Containers";
import { FeedbackSection } from "./sections/Feedback";
import { Domain } from "./sections/Domain";

type SectionId = "foundations" | "controls" | "containers" | "feedback" | "domain";
type Theme = "system" | "light" | "dark";
type Density = "comfortable" | "compact";

const SECTIONS: Array<{
  id: SectionId;
  label: string;
  title: string;
  lead: string;
}> = [
  {
    id: "foundations",
    label: "Foundations",
    title: "Foundations",
    lead: "Colour, type, space, shape, density and motion. Every value here is a custom property in tokens.css, and nothing outside that file holds a literal.",
  },
  {
    id: "controls",
    label: "Controls",
    title: "Controls",
    lead: "Buttons and form fields. Three control heights share one scale, so a button and an input sitting side by side always align on both edges.",
  },
  {
    id: "containers",
    label: "Containers",
    title: "Containers and navigation",
    lead: "Cards, wells, headings, tables and navigation. Structure is carried by rules and weight; nothing is lifted with a shadow to say that it is a group.",
  },
  {
    id: "feedback",
    label: "Feedback",
    title: "Feedback and state",
    lead: "Alerts, indicators, empty states and toasts. Every interactive surface in the app has a loading, empty and error rendition, so they are specified here rather than improvised per screen.",
  },
  {
    id: "domain",
    label: "Domain",
    title: "Domain components",
    lead: "The components that know what a requirement, a verdict, an evidence bundle and a log entry are. Each one encodes a rule that exists because the alternative would show a user something false.",
  },
];

export function Gallery() {
  const [section, setSection] = useState<SectionId>("foundations");
  const [theme, setTheme] = useState<Theme>("system");
  const [density, setDensity] = useState<Density>("comfortable");

  /*
   * The explicit attribute is what beats the `prefers-color-scheme` media query
   * in tokens.css, in both directions. "system" removes it entirely rather than
   * writing a guessed value, so the OS preference resumes control.
   */
  useEffect(() => {
    const root = document.documentElement;
    if (theme === "system") root.removeAttribute("data-theme");
    else root.setAttribute("data-theme", theme);
  }, [theme]);

  const current = SECTIONS.find((s) => s.id === section) ?? SECTIONS[0];

  return (
    <LedgerIcons>
      <div className="gx-shell" data-density={density}>
        <header className="gx-bar">
          <span className="gx-bar__mark">
            ZKCVP <span>Ledger design system</span>
          </span>

          <div className="gx-bar__controls">
            <div className="gx-bar__group">
              <span className="lg-micro-label">Theme</span>
              <ButtonGroup label="Theme">
                {(["system", "light", "dark"] as Theme[]).map((t) => (
                  <Button
                    key={t}
                    size="sm"
                    tone={theme === t ? "primary" : "secondary"}
                    aria-pressed={theme === t}
                    onClick={() => setTheme(t)}
                  >
                    {t === "system" ? "OS" : t === "light" ? "Light" : "Dark"}
                  </Button>
                ))}
              </ButtonGroup>
            </div>

            <div className="gx-bar__group">
              <span className="lg-micro-label">Density</span>
              <ButtonGroup label="Density">
                {(["comfortable", "compact"] as Density[]).map((d) => (
                  <Button
                    key={d}
                    size="sm"
                    tone={density === d ? "primary" : "secondary"}
                    aria-pressed={density === d}
                    onClick={() => setDensity(d)}
                  >
                    {d === "comfortable" ? "Comfortable" : "Compact"}
                  </Button>
                ))}
              </ButtonGroup>
            </div>
          </div>
        </header>

        <div className="gx-main">
          <SideNav label="Specimen groups">
            <SideNavSection label="Groups">
              {SECTIONS.map((s) => (
                <NavItem
                  key={s.id}
                  active={s.id === section}
                  onClick={() => setSection(s.id)}
                >
                  {s.label}
                </NavItem>
              ))}
            </SideNavSection>
          </SideNav>

          <main className="gx-body">
            <PageHeader title={current.title} lead={current.lead} />

            {section === "foundations" && <Foundations />}
            {section === "controls" && <Controls />}
            {section === "containers" && <Containers />}
            {section === "feedback" && <FeedbackSection />}
            {section === "domain" && <Domain />}
          </main>
        </div>
      </div>
    </LedgerIcons>
  );
}
