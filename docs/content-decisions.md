# Content decisions for document-owner review

This file records source ambiguities, wording adaptations and implementation interpretations. It is addressed to the owner of the DPIA template. Each item needs confirmation or correction. The application does not certify lawfulness. Workflow decisions are recorded human decisions.

Status values: **Interpreted** (our provisional reading in use), **Flagged** (needs owner verification), **Adapted** (wording changed, meaning preserved).

| ID | Source reference | Issue | Interpretation in the application | Status |
|---|---|---|---|---|
| CD-01 | Rights table, "Right not to be subject to automated decision-making": "Required if Section 1.6 is completed" | The source has no Section 1.6. Section numbering is 1.1, 1.2 then unnumbered headings | Treated as referring to the AI processing section (F), specifically profiling or significant automated decisions (`F.profiling`). Rule `COND-AUTODEC`. If Not sure, the row is unresolved, not not-applicable | Interpreted, Flagged |
| CD-02 | Risk matrix HIGH (9–16): "Prior consultation with the supervisory authority is required"; Conclusion: consultation "Required if residual risks remain HIGH after mitigation measures are applied and cannot be reduced further" | The matrix text ties consultation to a HIGH score; the conclusion ties it to HIGH residual risk after mitigation. Applying the first to inherent scores would be categorical | The matrix category text is kept as source wording. The application flags consultation only for unresolved current residual HIGH (`RISK-CONSULT`). High inherent risk triggers mandatory mitigation only. The application does not state any statutory conclusion | Interpreted, Flagged |
| CD-03 | Controllers guidance lists named group entities; examples name providers | Organisation-specific content | Replaced by the fictional Harbour Financial Group (Bank, Insurance, Asset Management) as suggestions; custom entries allowed; never prefilled as actual controllers or processors. Example entities and tools are neutralised | Adapted |
| CD-04 | Q6: "not already covered by questions above" | Unclear whether "not covered" refers to different individuals, different data, or both | No inference. When population ≥ 50 000 and any of Q1–Q5 is YES, Q6 is flagged for DPO review and the user explains. Never silently NO | Interpreted, Flagged |
| CD-05 | References to the named supervisory authority (Andmekaitse Inspektsioon) and the Estonian AML Act (cited as "AML Act § 40" in the storage-limitation example; "AML Act" in the scope and lawful-basis examples) | Jurisdiction-specific names and citations in a template used for a fictional organisation | Interface says "supervisory authority" with an optional authority-name field. Citations are not reproduced in the interface and not generalised or altered. Guidance asks users to identify the applicable law and provision. Exact source references stay in this file and the inventory for owner verification | Adapted, Flagged |
| CD-06 | Special category checklist | The first source option combines four categories (racial/ethnic origin, political opinions, religious or philosophical beliefs, trade union membership). The checklist also includes criminal convictions and offences | The combined option is kept as a parent with four selectable sub-items so the user can be specific. Criminal data is selectable in the same place but its authorisation is a separate field, not an Art 9(2) condition. Q1 wording keeps its own list of special categories as written | Interpreted |
| CD-07 | 5.6: example "computer activity monitoring software" | Unclear if workplace monitoring of staff is in scope of "tracking of location or movement" | Example is preserved as guidance only. The test is the exact wording of 5.6. Users explain in the rationale | Flagged |
| CD-08 | Criminal conviction/offence data inside the Article 9 checklist | Art 9(2) conditions do not authorise criminal data; separate authorisation is needed | Separate `E.sc.criminalAuth` explanation. Art 9(2) options not offered as the authorisation for criminal data | Interpreted |
| CD-09 | Scope: "If any part is covered by a separate DPIA, reference it and explain what has been excluded and why" | One free text for three things | Split into inclusions, exclusions and reasons, and an optional other-DPIA reference | Adapted |
| CD-10 | Description of processing: "vague or high-level summaries are not sufficient"; "avoid broad terms such as contact details" | Subjective sufficiency test | Deterministic hints only (for example a broad term list, very short answers). No claim of legal adequacy | Interpreted |
| CD-11 | Q5 parent wording "10 000 or more individuals and potentially create one or more of the following risks" | Parent wording could be read as the overall population ≥ 10 000 with any risk applying | Selected reading: per sub-question, both the specific risk and ≥ 10 000 individuals to whom it applies (rule `SCR-Q5-SUB`). Alternative reading not shown in assessments. Source-owner confirmation requested once, here | Interpreted, Flagged |
| CD-12 | Q1 count | Special category and criminal data may overlap | Count distinct individuals across both; no double counting | Interpreted |
| CD-13 | Q7 | Wording says a Yes "triggers" a TIA separate from any DPIA obligation | Shown as TIA follow-up indicated. Never indicates a full DPIA alone | Interpreted |
| CD-14 | Screening outcome row 1: "no full DPIA is required based on the screening results" | Could be read as a conclusion | Displayed as a screening indication pending DPO review; DPO may still require a full DPIA | Adapted |
| CD-15 | Screening outcome row 2: "A full DPIA is required, unless the DPO records a justified exception" | Statutory duty and organisational rule are mixed | Shown as "Full DPIA indicated" under the organisation's template rules. Statutory and organisational rules kept distinct; the application cannot waive a legal obligation | Adapted |
| CD-16 | Final decision: conditional approval lists conditions "1." "2." | Fixed two-line list | Repeatable condition records with description, owner, deadline, completion evidence, owner confirmation | Adapted |
| CD-17 | Periodic review: YES/NO plus "interval / routine / date" | Free text mixing interval and date | Next review date, or "No scheduled review" with rationale. No universal review interval imposed | Adapted |
| CD-18 | Version history row: version 1.0, "Initial draft" | Default text in template table | Used as default first row for the assessment's own version history. Template provenance (document history table) kept separately as template metadata | Adapted |
| CD-19 | Named internal tools and registries (documentation wiki, service-desk links, information asset registry, document hub, customer admin tool, HR vendor) | Organisation-specific tools | Replaced by functional descriptions: optional text/link reference fields; no integrations | Adapted |
| CD-20 | Rights status options | "Not applicable" exists only for two conditional rows | Preserved: only those two rows offer "not applicable" (with rationale). Other rows may use planned / partially implemented / implemented, plus an unresolved "Not sure" state added by the application | Interpreted |
| CD-21 | Art 6(1) lawful basis | Source allows free selection of (a)–(f) | Multi-select per purpose is allowed; one justification per purpose, with optional per-basis detail if several are selected | Interpreted |
| CD-22 | Intro: "A DPIA is mandatory for processing likely to result in high risk" | Statement of a statutory duty inside an organisational template | Preserved as source text in help and overview; screening rules remain organisational, not statutory | Flagged |
| CD-23 | Document history v2/v3 "created by" attribution | Personal attribution within the template | Kept in the provenance record only; not shown in assessments | Adapted |

## Interview decisions (agreed with the project owner)

| ID | Decision |
|---|---|
| ID-01 | Two review gates in one lifecycle. Screening gate snapshots and locks A–C while D–K stay editable. Full DPIA gets a separate review and owner decision |
| ID-02 | Pre-assessment-only: DPO records screening decision and short formal opinion in one action; owner then records final decision; no second submission of the same information |
| ID-03 | Exception from a full DPIA indication needs explicit justification and mitigation controls; screening rationale is always recorded |
| ID-04 | Screening answer changes after submission invalidate the affected screening decision and require renewed review; history preserved |
| ID-05 | Two DPO users seeded. Owner chooses the assigned DPO at creation (eligible DPO users only, never the owner). Administrator may reassign with a reason; previous opinions stay with original authors; pending review transfers and notifies |
| ID-06 | Fictional organisation: Harbour Financial Group (Bank, Insurance, Asset Management) |
| ID-07 | Q5.1–5.6 per sub-question population rule, tri-state evaluation, no summing across sub-questions |
| ID-08 | Three layers of testing; single Railway database; no extra infrastructure; reset not run against the shared database |
| ID-09 | Per-field optimistic concurrency with record-level checks for structural changes |
| ID-10 | Responsible persons: demo user or free text; responsibility never grants access; progress rights limited to own item |
| ID-11 | Three change classes (substantive / progress / administrative) defined centrally with a coverage check |
| ID-12 | Assignment unit: subsection ID; no indirect edits outside scope through shared entities |
| ID-13 | Railway project chic-reverence exists with app service privacy-assessment-guide and Postgres; `DATABASE_URL` configured but unverified; project owner performs dashboard actions guided by Claude; no CLI installs |
| ID-14 | `DPIA_Template.docx` is git-ignored and never published |
