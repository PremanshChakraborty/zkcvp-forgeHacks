"use client";

import { useState } from "react";
import { Spec } from "../Spec";
import {
  Button,
  ButtonGroup,
  Checkbox,
  Field,
  Fieldset,
  ICON_MD,
  IconButton,
  IconCopy,
  IconPlus,
  IconRetry,
  Input,
  Radio,
  Select,
  Textarea,
} from "../../components";

export function Controls() {
  const [loading, setLoading] = useState(false);
  const [sha, setSha] = useState("");

  /* Specimen-only validation, so the error rendition is reachable in the
     gallery. The real rule belongs to the claim form. */
  const shaError =
    sha.length > 0 && !/^[0-9a-f]{7,40}$/.test(sha)
      ? "A commit SHA is 7 to 40 lowercase hexadecimal characters."
      : undefined;

  return (
    <>
      <Spec
        name="Button tones"
        api="Button tone="
        note="Four tones, and exactly one of them is filled with the accent, because a surface with two primary actions has no primary action. The tone prop defaults to secondary rather than primary so the emphatic variant has to be asked for. Danger is filled too, deliberately: it is only used for the irreversible operations in this product, and a quiet destructive button is a trap."
      >
        <Button tone="primary">Submit claim</Button>
        <Button tone="secondary">Verify digest</Button>
        <Button tone="quiet">Cancel</Button>
        <Button tone="danger">Remove repository</Button>
      </Spec>

      <Spec
        name="Button sizes"
        api="Button size= · --lg-control-sm/md/lg"
        note="Three rungs, shared with every other interactive control, so a button and an input sitting side by side always align on both edges. Labels never wrap: a two-line button is a broken button, and the fix is a shorter label rather than a taller control."
      >
        <Button size="sm">Small</Button>
        <Button size="md">Medium</Button>
        <Button size="lg">Large</Button>
        <Input placeholder="aligned to md" style={{ width: "14rem" }} />
      </Spec>

      <Spec
        name="Button with icon, and loading"
        api="Button icon= loading="
        note="Loading replaces the leading icon with a spinner, keeps the label in place so the button does not resize mid-request, and sets aria-busy rather than swapping the label for 'Loading'. A screen reader user who has already heard the label does not need it replaced, and replacing it loses which action is in flight."
      >
        <Button tone="primary" icon={<IconPlus size={ICON_MD} />}>
          Add requirement
        </Button>
        <Button icon={<IconRetry size={ICON_MD} />}>Re-evaluate</Button>
        <Button
          tone="primary"
          loading={loading}
          onClick={() => {
            setLoading(true);
            window.setTimeout(() => setLoading(false), 2200);
          }}
        >
          Submit claim
        </Button>
        <Button disabled>Disabled</Button>
      </Spec>

      <Spec
        name="Icon button"
        api="IconButton label="
        note="The label prop is required and becomes the accessible name. An icon-only control with no label is invisible to a screen reader, so there is no way to omit it."
      >
        <IconButton label="Copy digest" icon={<IconCopy size={ICON_MD} />} />
        <IconButton
          label="Re-evaluate"
          tone="secondary"
          icon={<IconRetry size={ICON_MD} />}
        />
        <ButtonGroup label="Specimen group">
          <Button size="sm">Commits</Button>
          <Button size="sm">Branches</Button>
          <Button size="sm">Tags</Button>
        </ButtonGroup>
      </Spec>

      <Spec
        name="Text field"
        api="Field · Input"
        note="Label above, help text below the control, error text below that. Never a placeholder standing in for a label: a placeholder disappears the moment the user types, which means the one piece of text explaining what a field wants is gone exactly when they are trying to fill it in."
        layout="block"
      >
        <div style={{ maxWidth: "26rem", display: "grid", gap: "var(--lg-space-4)" }}>
          <Field
            label="Requirement title"
            help="What the stakeholder will read in the checklist."
            required
          >
            {({ id, describedBy }) => (
              <Input
                id={id}
                aria-describedby={describedBy}
                placeholder="Rate limiting on the public API"
              />
            )}
          </Field>

          <Field
            label="Commit SHA"
            help="The exact commit the Evaluator will read. Never live HEAD."
            error={shaError}
          >
            {({ id, describedBy, invalid }) => (
              <Input
                id={id}
                mono
                aria-describedby={describedBy}
                invalid={invalid}
                value={sha}
                onChange={(e) => setSha(e.target.value)}
                placeholder="4f2c9ab"
              />
            )}
          </Field>

          <Field label="Disabled" help="Not editable in this phase.">
            {({ id, describedBy }) => (
              <Input
                id={id}
                aria-describedby={describedBy}
                disabled
                value="Not set"
              />
            )}
          </Field>
        </div>
      </Spec>

      <Spec
        name="Textarea and select"
        api="Textarea · Select"
        note="The textarea is set at the reading size rather than the UI size, because what goes into it is sentences. The select uses a native element, so its options are reachable with a keyboard and rendered by the platform on touch."
        layout="block"
      >
        <div style={{ maxWidth: "26rem", display: "grid", gap: "var(--lg-space-4)" }}>
          <Field
            label="Requirement description"
            help="Editing this text creates a new version. Verification status attaches to the version it was evaluated against, never to whatever is current."
          >
            {({ id, describedBy }) => (
              <Textarea
                id={id}
                aria-describedby={describedBy}
                rows={4}
                defaultValue="Requests to the public API are limited per token, and exceeding the limit returns 429 with a Retry-After header."
              />
            )}
          </Field>

          <Field label="Repository">
            {({ id, describedBy }) => (
              <Select id={id} aria-describedby={describedBy} defaultValue="api">
                <option value="api">kestrel-labs/attest-api</option>
                <option value="web">kestrel-labs/attest-web</option>
                <option value="infra">kestrel-labs/infra</option>
              </Select>
            )}
          </Field>
        </div>
      </Spec>

      <Spec
        name="Checkbox and radio"
        api="Checkbox · Radio · Fieldset"
        note="Native inputs, restyled, so keyboard behaviour, form participation, the indeterminate state and label association come for free rather than being reimplemented on a div. The checked fill is the accent blue under a white tick, which clears contrast in both themes with one glyph."
        layout="block"
      >
        <div style={{ display: "grid", gap: "var(--lg-space-5)" }}>
          <div style={{ display: "grid", gap: "var(--lg-space-2)" }}>
            <Checkbox label="Pin the current requirement version set" defaultChecked />
            <Checkbox label="Include archived requirements" />
            <Checkbox label="Some requirements selected" indeterminate />
            <Checkbox label="Not available in this phase" disabled />
          </div>

          <Fieldset legend="Who can read this report">
            <Radio name="aud" label="Stakeholders on this project" defaultChecked />
            <Radio name="aud" label="Developers on this project" />
            <Radio name="aud" label="Anyone with the link" disabled />
          </Fieldset>
        </div>
      </Spec>
    </>
  );
}
