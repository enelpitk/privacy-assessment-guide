import type { Cond } from "@/domain/conditions";
import type { ChangeClass, WorkflowOwner } from "@/domain/permissions";

export type { ChangeClass, WorkflowOwner };

export type FieldType =
  | "text"
  | "longtext"
  | "date"
  | "number"
  | "quantity"
  | "choice"
  | "multi"
  | "yesno"
  | "flag"
  | "entity"
  | "entities"
  | "person"
  | "link"
  | "computed";

export type EntityKindName = "PARTY" | "DATA_SUBJECT" | "DATA_CATEGORY";

export interface Option {
  value: string;
  label: string;
  description?: string;
  /** Inventory ID this source choice maps to. */
  id?: string;
}

export interface Help {
  /** Keep the inline text visible: it is a qualification or the question itself, needed to answer correctly. */
  essential?: boolean;
  /** One or two plain-English sentences shown under the question. */
  inline?: string;
  /** "Explain this" text. */
  explain?: string;
  /** "What should my answer include?" */
  include?: string;
  /** Illustrative example. Guidance only, never an answer. */
  example?: string;
}

export interface Hint {
  when: Cond;
  text: string;
}

export interface FieldDef {
  kind: "field";
  id: string;
  label: string;
  /** Original template wording when the label is split or adapted. */
  sourceText?: string;
  type: FieldType;
  options?: Option[];
  /** Excluded from completeness when true. */
  optional?: boolean;
  allowNA?: boolean;
  allowNotSure?: boolean; // default true
  help?: Help;
  hints?: Hint[];
  activeWhen?: Cond;
  /** Field counts as complete when this holds even if unanswered. */
  completeWhen?: Cond;
  workflow?: WorkflowOwner;
  workflowNote?: string;
  /** Inventory IDs for guidance / example / rule rows satisfied by this field's help. */
  covers?: string[];
  /** Not in the source inventory (added by the application). */
  added?: boolean;
  entityKind?: EntityKindName;
  /** CD-24: whether a "Yes" answer is a favourable or concern signal. The stored answer is never reversed. */
  yesMeaning?: "favourable" | "concern";
  yesMeaningText?: string;
  changeClass?: ChangeClass; // default SUBSTANTIVE
  computed?: "inherentScore" | "residualScore" | "targetScore" | "owner" | "displayId" | "dpoName";
  maxLength?: number;
  placeholder?: string;
}

export interface CollectionDef {
  kind: "collection";
  id: string;
  label: string;
  itemLabel: string;
  addLabel?: string;
  /** Field id whose value titles each card. */
  titleField?: string;
  items: Item[];
  min?: number;
  activeWhen?: Cond;
  covers?: string[];
  added?: boolean;
  workflow?: WorkflowOwner;
  workflowNote?: string;
  help?: Help;
}

export type InfoBlock =
  | "text"
  | "scales"
  | "matrix"
  | "riskLegend"
  | "riskExamples"
  | "versionHistory"
  | "provenance"
  | "screeningOutcomes"
  | "pending";

export interface InfoDef {
  kind: "info";
  id: string;
  block: InfoBlock;
  title?: string;
  body?: string;
  covers?: string[];
  activeWhen?: Cond;
  added?: boolean;
  /** For block "pending": the stage that will deliver this function. */
  pendingStage?: number;
}

export type Item = FieldDef | CollectionDef | InfoDef;

export interface SubsectionDef {
  id: string;
  stage: string;
  title: string;
  /** One sentence shown in navigation and the help panel. */
  summary: string;
  intro?: string;
  help?: Help;
  items: Item[];
  activeWhen?: Cond;
  covers?: string[];
}

export interface StageDef {
  id: string;
  title: string;
  description: string;
  subsections: SubsectionDef[];
}
