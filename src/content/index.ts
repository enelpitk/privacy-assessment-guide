// Structured template definition. Template version tpl-1.0.0 (see docs/template-rules.md).
import type {
  CollectionDef,
  FieldDef,
  InfoDef,
  Item,
  StageDef,
  SubsectionDef,
} from "./types";
import { STAGE_A, STAGE_B, STAGE_C, STAGE_D } from "./stages-a-d";
import { STAGE_E, STAGE_F, STAGE_G } from "./stages-e-g";
import { STAGE_H, STAGE_I, STAGE_J, STAGE_K } from "./stages-h-k";

export const TEMPLATE_VERSION = "tpl-1.0.0";
export const RULES_VERSION = "rules-1.0.0";

export const STAGES: StageDef[] = [
  STAGE_A, STAGE_B, STAGE_C, STAGE_D, STAGE_E, STAGE_F,
  STAGE_G, STAGE_H, STAGE_I, STAGE_J, STAGE_K,
];

export const SUBSECTIONS: SubsectionDef[] = STAGES.flatMap((s) => s.subsections);

export const subsectionById = new Map(SUBSECTIONS.map((s) => [s.id, s]));

export interface FieldLocation {
  def: FieldDef;
  subsectionId: string;
  /** Collection ids from outermost to innermost; empty for top-level fields. */
  collections: string[];
}

export interface CollectionLocation {
  def: CollectionDef;
  subsectionId: string;
  parent?: string;
}

export const fieldIndex = new Map<string, FieldLocation>();
export const collectionIndex = new Map<string, CollectionLocation>();
export const infoIndex = new Map<string, { def: InfoDef; subsectionId: string }>();

function walk(items: Item[], subsectionId: string, chain: string[]) {
  for (const it of items) {
    if (it.kind === "field") {
      if (fieldIndex.has(it.id)) throw new Error(`Duplicate field id ${it.id}`);
      fieldIndex.set(it.id, { def: it, subsectionId, collections: chain });
    } else if (it.kind === "collection") {
      if (collectionIndex.has(it.id)) throw new Error(`Duplicate collection id ${it.id}`);
      collectionIndex.set(it.id, {
        def: it,
        subsectionId,
        parent: chain[chain.length - 1],
      });
      walk(it.items, subsectionId, [...chain, it.id]);
    } else {
      if (infoIndex.has(it.id)) throw new Error(`Duplicate info id ${it.id}`);
      infoIndex.set(it.id, { def: it, subsectionId });
    }
  }
}
for (const sub of SUBSECTIONS) walk(sub.items, sub.id, []);

export function changeClassOf(def: { changeClass?: FieldDef["changeClass"] }) {
  return def.changeClass ?? "SUBSTANTIVE";
}

/** Fields that accept user input (not computed, not workflow-owned). */
export function isInputField(def: FieldDef): boolean {
  return def.type !== "computed" && !def.workflow;
}

export * from "./types";
