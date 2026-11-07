import type {
  CollectionDef,
  FieldDef,
  FieldType,
  InfoBlock,
  InfoDef,
  Item,
  Option,
} from "./types";

type FieldExtra = Partial<Omit<FieldDef, "kind" | "id" | "label" | "type">>;

export const field = (
  id: string,
  label: string,
  type: FieldType,
  extra: FieldExtra = {},
): FieldDef => ({ kind: "field", id, label, type, ...extra });

export const text = (id: string, label: string, extra?: FieldExtra) =>
  field(id, label, "text", extra);
export const longtext = (id: string, label: string, extra?: FieldExtra) =>
  field(id, label, "longtext", extra);
export const yesno = (id: string, label: string, extra?: FieldExtra) =>
  field(id, label, "yesno", extra);
export const date = (id: string, label: string, extra?: FieldExtra) =>
  field(id, label, "date", extra);
export const link = (id: string, label: string, extra?: FieldExtra) =>
  field(id, label, "link", { optional: true, ...extra });
export const flag = (id: string, label: string, extra?: FieldExtra) =>
  field(id, label, "flag", extra);
export const quantity = (id: string, label: string, extra?: FieldExtra) =>
  field(id, label, "quantity", extra);
export const choice = (
  id: string,
  label: string,
  options: Option[],
  extra?: FieldExtra,
) => field(id, label, "choice", { options, ...extra });
export const multi = (
  id: string,
  label: string,
  options: Option[],
  extra?: FieldExtra,
) => field(id, label, "multi", { options, ...extra });
export const entity = (
  id: string,
  label: string,
  entityKind: "PARTY" | "DATA_SUBJECT" | "DATA_CATEGORY",
  extra?: FieldExtra,
) => field(id, label, "entity", { entityKind, ...extra });
export const entities = (
  id: string,
  label: string,
  entityKind: "PARTY" | "DATA_SUBJECT" | "DATA_CATEGORY",
  extra?: FieldExtra,
) => field(id, label, "entities", { entityKind, ...extra });
export const person = (id: string, label: string, extra?: FieldExtra) =>
  field(id, label, "person", extra);

export const info = (
  id: string,
  block: InfoBlock,
  extra: Partial<Omit<InfoDef, "kind" | "id" | "block">> = {},
): InfoDef => ({ kind: "info", id, block, ...extra });

export const note = (
  id: string,
  title: string,
  body: string,
  covers?: string[],
): InfoDef => ({ kind: "info", id, block: "text", title, body, covers, added: true });

export const pending = (
  id: string,
  title: string,
  body: string,
  pendingStage: number,
  covers?: string[],
): InfoDef => ({
  kind: "info",
  id,
  block: "pending",
  title,
  body,
  pendingStage,
  covers,
  added: true,
});

export const collection = (
  id: string,
  label: string,
  itemLabel: string,
  items: Item[],
  extra: Partial<Omit<CollectionDef, "kind" | "id" | "label" | "itemLabel" | "items">> = {},
): CollectionDef => ({ kind: "collection", id, label, itemLabel, items, ...extra });

export const opt = (
  value: string,
  label: string,
  id?: string,
  description?: string,
): Option => ({ value, label, id, description });

export const YES_NO_NOTSURE_NOTE =
  "Choose Yes or No. If you cannot answer yet, use “Not sure — I need help” or “Complete later”; these stay unresolved and are never treated as No.";
