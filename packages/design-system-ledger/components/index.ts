/**
 * ZKCVP · Ledger — public surface.
 *
 * Import from here, never from individual files, so component moves stay
 * internal. The stylesheet is a separate import and is required:
 *
 *   import "@/design-system-ledger/styles/ledger.css";
 *   import { Button, StatusBadge } from "@/design-system-ledger/components";
 *
 * This list is the whole public surface. An earlier visual direction was
 * explored and removed; this one was a strict superset of it, so nothing was
 * lost in dropping it.
 */

export { cx } from "./cx";

export * from "./types";
export * from "./icons";

export { Button, IconButton, ButtonGroup } from "./Button";
export type { ButtonProps, IconButtonProps, ButtonTone, ControlSize } from "./Button";

export {
  Field,
  Input,
  Textarea,
  Select,
  Checkbox,
  Radio,
  Fieldset,
} from "./Form";
export type {
  FieldProps,
  InputProps,
  TextareaProps,
  SelectProps,
  CheckboxProps,
} from "./Form";

export {
  Badge,
  StatusBadge,
  VerdictBadge,
  SystemErrorBadge,
  VersionPill,
  RoleTag,
  StatusDot,
} from "./Badge";
export type {
  BadgeProps,
  StatusBadgeProps,
  VerdictBadgeProps,
  VersionPillProps,
  ChipTone,
} from "./Badge";

export {
  Card,
  CardHeader,
  CardBody,
  CardFooter,
  Well,
  PageHeader,
  Section,
  SectionHeading,
} from "./Card";
export type { CardProps, PageHeaderProps } from "./Card";

export { Disclosure, DisclosureList } from "./Disclosure";
export type { DisclosureProps } from "./Disclosure";

export { Table, Td, DescriptionList } from "./Table";
export type { TableProps, CellProps, DescriptionListProps } from "./Table";

export {
  CopyButton,
  Mono,
  CommitSha,
  HashRef,
  RepoRef,
  BranchRef,
  FileRef,
} from "./Identifiers";
export type { MonoProps, CommitShaProps, HashRefProps } from "./Identifiers";

export { CommitRow, CommitList } from "./Commit";
export type { CommitRowProps } from "./Commit";

export {
  RequirementRow,
  RequirementList,
  ChecklistProgress,
} from "./Requirement";
export type { RequirementRowProps } from "./Requirement";

export {
  VerdictCard,
  VerdictStatement,
  EvidenceLock,
  LogRef,
} from "./Verdict";
export type { VerdictCardProps, EvidenceLockProps } from "./Verdict";

export {
  Alert,
  Spinner,
  ProgressBar,
  EmptyState,
  Skeleton,
  ToastRegion,
  Toast,
  UndoToast,
  EvaluationProgress,
} from "./Feedback";
export type {
  AlertTone,
  AlertProps,
  UndoToastProps,
  EvaluationProgressProps,
  EvaluationPhase,
} from "./Feedback";

export { Tabs, NavStrip, Breadcrumb, SideNav, SideNavSection, NavItem } from "./Nav";
export type { TabItem, Crumb } from "./Nav";

export { Timeline, TimelineItem } from "./Timeline";
export type { TimelineItemProps } from "./Timeline";
