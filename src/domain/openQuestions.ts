// "Open questions" summary: what is unresolved or incomplete. Counts completeness, not compliance.
import { SUBSECTIONS, type SubsectionDef } from "@/content";
import type { AssessmentResult, Gap } from "./model";

export interface OpenItem {
  subsectionId: string;
  fieldId: string;
  recordId: string;
  label: string;
  note: string | null;
  kind: "NOT_SURE" | "COMPLETE_LATER" | "HELP_REQUEST" | "INCOMPLETE";
}

export interface OpenQuestions {
  unresolved: OpenItem[];
  incompleteBySubsection: { subsection: SubsectionDef; count: number }[];
  incompleteTotal: number;
}

export function openQuestions(result: AssessmentResult): OpenQuestions {
  const unresolved: OpenItem[] = [];
  const incompleteBySubsection: OpenQuestions["incompleteBySubsection"] = [];
  let incompleteTotal = 0;
  for (const sub of SUBSECTIONS) {
    const r = result.subsections[sub.id];
    if (!r || !r.active) continue;
    let incomplete = 0;
    for (const g of r.gaps as Gap[]) {
      if (g.status === "INCOMPLETE") {
        incomplete++;
        continue;
      }
      unresolved.push({
        subsectionId: sub.id,
        fieldId: g.fieldId,
        recordId: g.recordId,
        label: g.label,
        note: g.note ?? null,
        kind: g.fieldId.endsWith(".help") ? "HELP_REQUEST" : g.status === "UNRESOLVED_LATER" ? "COMPLETE_LATER" : "NOT_SURE",
      });
    }
    if (incomplete > 0) incompleteBySubsection.push({ subsection: sub, count: incomplete });
    incompleteTotal += incomplete;
  }
  return { unresolved, incompleteBySubsection, incompleteTotal };
}
