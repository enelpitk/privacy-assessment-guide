# Source coverage review (manual, Stage 1)

This is a **manual review of the inventory against `DPIA_Template.docx` itself**. It is not the automated check. Stage 2 adds a separate automated test that checks that every inventory ID has a structured definition and that every definition maps back to an inventory ID. That test cannot prove the inventory is faithful to the source; only a source review can. This review also has limits, listed at the end. It is one pass by the implementer, not an independent review, so the document owner should still confirm it.

## Method

1. Extracted the text of the document body (904 paragraph lines) and read it in full against the inventory.
2. Inspected the document structure for content a plain text read could miss:
   - Tracked insertions/deletions: **0**. Hidden text: **0**. Text boxes: **0**. Comments: none. Footnotes/endnotes: empty. Header: empty. Footer: page number only. Hyperlinks: **0**. Embedded images: none (no media part).
   - Content controls: **96, all checkboxes**. No dropdowns, date pickers or text controls.
   - Tables: **31**. Row and column headers were read for each and compared to the inventory.
3. Reconciled the checkboxes. Source count 96 = inventory options: reasons 4, screening outcomes 3, DPO decision 2, Article 6(1) bases 6, special/criminal categories 6, Article 9(2) conditions 10, sharing "agreement in place" 2, AI profiling Yes/No 2, human oversight 3, AI classification 4, internal policies 3, external requirements 2, Article 5 principle status 8×3 = 24, rights status 4×3 + 4 + 4 = 20, final decision 3, periodic review Yes/No 2. Total 96. ✔
4. Checked that the Yes/No answer cells in the screening and necessity/proportionality tables are free cells, not checkboxes (they are), so the inventory treats them as Yes/No question values.

## Result by source section

| Source section | Items checked | Result |
|---|---|---|
| Introductory paragraphs (5 paragraphs) | Scope, mandatory rule, when to complete, timing | Covered (`TPL.intro.*`) |
| General (table 1) | Name, owner, description, 4 reason checkboxes, two conditional text fields | Covered (`A.*`) |
| Controllers (table 2) | Definition, joint-controller rule, no-joint-controller rule, 2 columns | Covered (`B.ctrl.*`) |
| Processors (table 3) | Definition, example, N/A rule, 3 columns, sub-processor rows | Covered (`B.proc.*`, `B.sub.*`) |
| Screening (table 4, 14 rows) | Q1–Q4, Q5, 5.1–5.6, Q6, Q7, rationale column, examples, TIA note | Covered (`C.q*`). Thresholds 5000 / 10 000 / 50 000 are in `template-rules.md` |
| Screening outcome (table 5) | 3 outcomes, exception rationale/mitigation controls, DPO advice, DPO-may-require note, 2 decision checkboxes, DPO name and date | Covered (`C.out.*`, `C.exception.*`, `C.dpo.*`, `C.dec.*`) |
| DPIA rationale (table 6) | Scope question with separate-DPIA reference, launch date | Covered (`D.*`); split adaptation CD-09 |
| 1.1 Description (table 7) | Five definitional bullets, 5 columns, 6 Article 6(1) bases with meanings | Covered after this review (see corrections 5 and 6) |
| 1.2 Special/criminal (table 8) | 6 categories, 10 Article 9(2) conditions with meanings, justification, add-row rule | Covered (`E.sc.*`); CD-06, CD-08 |
| Further use (table 9) | Applicability note, questions, example, 2 columns | Covered (`E.sec.*`) |
| Nature / scope / context (table 10) | 3 questions with 4 bullets each, 3 examples, documentation reference | Covered (`E.nature`, `E.scope`, `E.context`) |
| Data sharing (table 11) | Guidance, N/A rule, 6 columns, agreement Yes/No | Covered (`E.share.*`) |
| AI processing (table 12) | 8 questions, Yes/No, 3 oversight options, 4 classification options, examples | Covered (`F.*`) |
| Compliance (table 13) | Internal 3-way status and conditional text; external Yes/No and conditional text; examples | Covered (`G.*`) |
| 2.1–2.3 (tables 14–16) | 3 + 3 + 4 questions, examples | Covered (`H.min.*`, `H.quality.*`, `H.sec.*`) |
| 2.4 principles (table 17) | 8 principles, key questions, examples, 3 statuses | Covered (`H.p.*`) with sub-ID convention (correction 2) |
| Data subject rights (table 18) | 6 rights, key questions, examples, statuses, two conditional notes, "not applicable" on two rows | Covered (`H.r.*`); CD-01 unresolved, CD-20 |
| Necessity (table 19) / proportionality (table 20) | 4 + 3 questions, Yes/No, justification | Covered (`I.*`); CD-24 |
| Scales (tables 21–22) | 4 + 4 levels with descriptions and parenthetical frequency/effect labels | Covered (`J.scale.*`) |
| Matrix (table 23) | 16 cells (score + category) | Covered (`J.matrix`); computed |
| Category legend (table 24) | Low / Medium / High statements | Covered after this review (correction 4) |
| Risk register (table 25) | 11 columns, 3 worked examples with scores | Covered after this review (`J.risk.ex1–3`) |
| Conclusion (tables 26–29) | DPO opinion, views, authority consultation, final decision with 3 options and conditions | Covered (`K.*`); CD-02, CD-25 |
| Review and version history (table 30) | Periodic Yes/No, interval, 5-column history with initial draft row | Covered (`K.review.*`, `K.hist.*`); CD-17, CD-18 |
| Appendix and document history (tables, 31) | Additional documentation, provenance rows v1–v3 | Covered (`K.appx.docs`, `TPL.doc.*`) |

## Corrections made in this review

1. Export rule rewritten (version-specific, inactive answers excluded, long guidance excluded, comments optional, formal opinions and decision rationales always included, inactive answers preserved internally).
2. Added an answer convention and per-row sub-ID pattern for table rows that bundle several source cells.
3. Section 1.6 reference kept unresolved (CD-01, inventory, `COND-AUTODEC`). No source correction is claimed.
4. Both consultation statements preserved separately (`J.cat.high.*`, `K.sa.guidance`) with the implemented rule and rationale in CD-02.
5. Added the omitted examples for data subjects and personal data categories, and the full source meaning of every Article 6(1) and Article 9(2) option (previously abbreviated).
6. Added the three worked risk examples with their scores and measures as separate guidance rows.
7. CD-05 clarified: only national citations and the named authority are withheld from the interface; EU-level article references and all answer choices are kept. The adapted justification question still asks for the relevant law and provision.
8. New decisions CD-24 (necessity/proportionality table heading and inverted question), CD-25 (decision rationale required by the project though optional in the source), CD-26 (inspection limits).

## Uncertain mappings and limits

- **Not rendered visually.** Cell shading (for example LOW/MEDIUM/HIGH colours), merged cells and page layout were not rendered. The matrix colours and any text carried only by formatting would not appear in a text read.
- **Order within a table cell** was read from the document structure. Where a source cell holds several questions (nature, scope, context), the inventory keeps the original as one reference item and splits the input (`E.nature`, `E.scope`, `E.context`).
- **Words such as "XXX" and named group entities, tools and authority** are placeholders in the source; CD-03, CD-05 and CD-19 record how they are replaced.
- **Example text** is mapped by example, not reproduced word for word in the inventory. The structured definitions in Stage 2 must carry the full guidance text, and the owner should confirm that wording against the template.
- **Single reviewer.** No independent second reading has been done.

## What is not claimed

Complete source coverage is **not** claimed beyond the above. The inventory is judged complete against the document structure that was inspected; remaining risk is wording-level fidelity of guidance text, which Stage 2 definitions and the document-owner review must confirm.
