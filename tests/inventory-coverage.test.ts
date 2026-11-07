import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  SUBSECTIONS,
  changeClassOf,
  collectionIndex,
  fieldIndex,
  infoIndex,
} from "@/content";

/** Parse the first-column IDs of the source-to-application inventory. */
export function inventoryIds(): string[] {
  const md = readFileSync(path.join(process.cwd(), "docs", "source-inventory.md"), "utf8");
  const ids = new Set<string>();
  for (const line of md.split(/\r?\n/)) {
    const m = /^\| ([A-Za-z][A-Za-z0-9_.[\]–-]*) \|/.exec(line);
    if (!m) continue;
    const raw = m[1];
    if (!raw.includes(".")) continue;
    const norm = raw.replace(/\[\]/g, "");
    const range = /^(.*[a-z])(\d)–[a-z](\d)$/.exec(norm);
    if (range) {
      for (let n = Number(range[2]); n <= Number(range[3]); n++) ids.add(`${range[1]}${n}`);
    } else {
      ids.add(norm);
    }
  }
  return [...ids];
}

function definedIds(): Set<string> {
  const s = new Set<string>();
  for (const [id, loc] of fieldIndex) {
    s.add(id);
    loc.def.covers?.forEach((c) => s.add(c));
    loc.def.options?.forEach((o) => o.id && s.add(o.id));
  }
  for (const [id, loc] of collectionIndex) {
    s.add(id);
    loc.def.covers?.forEach((c) => s.add(c));
  }
  for (const [id, loc] of infoIndex) {
    s.add(id);
    loc.def.covers?.forEach((c) => s.add(c));
  }
  for (const sub of SUBSECTIONS) sub.covers?.forEach((c) => s.add(c));
  return s;
}

describe("source inventory coverage (automated, inventory -> definitions)", () => {
  const ids = inventoryIds();
  const defined = definedIds();

  it("parses a plausible number of inventory IDs", () => {
    expect(ids.length).toBeGreaterThan(250);
  });

  it("every inventory ID has a structured definition, option, guidance or rule mapping", () => {
    const missing = ids.filter((id) => !defined.has(id));
    expect(missing).toEqual([]);
  });

  it("every non-added definition appears in the inventory (no unmapped invented content)", () => {
    const inv = new Set(ids);
    const stray: string[] = [];
    for (const [id, loc] of fieldIndex) if (!loc.def.added && !inv.has(id)) stray.push(id);
    for (const [id, loc] of collectionIndex) if (!loc.def.added && !inv.has(id)) stray.push(id);
    for (const [id, loc] of fieldIndex) {
      for (const o of loc.def.options ?? []) if (o.id && !inv.has(o.id)) stray.push(o.id);
    }
    expect(stray).toEqual([]);
  });

  it("every covers entry references a real inventory ID", () => {
    const inv = new Set(ids);
    const bad: string[] = [];
    const check = (c: string[] | undefined) => c?.forEach((x) => !inv.has(x) && bad.push(x));
    for (const loc of fieldIndex.values()) check(loc.def.covers);
    for (const loc of collectionIndex.values()) check(loc.def.covers);
    for (const loc of infoIndex.values()) check(loc.def.covers);
    for (const sub of SUBSECTIONS) check(sub.covers);
    expect(bad).toEqual([]);
  });

  it("field IDs are unique and every field has a change class", () => {
    for (const loc of fieldIndex.values()) {
      expect(["SUBSTANTIVE", "PROGRESS", "ADMINISTRATIVE"]).toContain(changeClassOf(loc.def));
    }
  });
});
