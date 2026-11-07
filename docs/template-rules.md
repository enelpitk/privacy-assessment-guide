# Versioned template rules

Template-definition version: **tpl-1.0.0** (rules version `rules-1.0.0`). These are the organisational rules of the source template. They are **not statutory thresholds** and the application never presents them as legal conclusions. They will live in `content/rules.ts` as configuration (IDs below are stable) and be evaluated by pure functions in `src/domain/screening`.

Any change to a threshold or condition creates a new rules version. A screening record stores the rules version it was evaluated with.

## Tri-state evaluation

Every condition evaluates to **YES**, **NO** or **UNRESOLVED**.

- Inputs may be a confirmed answer, an approximate count or range, or "Not sure".
- UNRESOLVED when uncertainty could change the result (including an estimate range that straddles a threshold).
- "Not sure" and "Complete later" are never treated as No.
- Thresholds are inclusive ("or more").
- All counts refer to the same assessment scope and time period (stated in C0).

## Screening rules

| Rule ID | Condition (source-faithful) | Evaluation |
|---|---|---|
| `SCR-Q1-THRESHOLD` | Special category data **or** criminal convictions/offences data relating to ≥ 5000 individuals | Count = distinct individuals in either group, no double counting (C0 `specialCount`). YES if count ≥ 5000 (lower bound), NO if upper bound < 5000 or no such data, otherwise UNRESOLVED |
| `SCR-Q2` | Systematic and extensive evaluation or scoring, including profiling, based on automated processing, **and** the result has legal consequences or similarly significant impact | User-answered, compound conditions captured as three sub-inputs: systematic and extensive evaluation, automated processing, legal/similarly significant effect. YES when all three YES; NO if any is NO; else UNRESOLVED |
| `SCR-Q3` | New technologies, or existing technologies applied in a new way | User-answered Yes/No/Not sure |
| `SCR-Q4` | Systematic **and** large-scale monitoring of a publicly accessible area | YES when both parts YES; NO if either NO; else UNRESOLVED |
| `SCR-Q5-SUB` (5.1–5.6) | Per sub-question: the specific risk condition applies **and** it applies to ≥ 10 000 individuals | See below |
| `SCR-Q5-AGG` | Q5 overall | YES if at least one sub-question is a confirmed YES. Counts are never added across sub-questions. Another UNRESOLVED sub-question does not cancel a YES; it is listed separately. If none YES and any UNRESOLVED, then UNRESOLVED. Otherwise NO |
| `SCR-Q6-THRESHOLD` | Any other personal data relating to ≥ 50 000 individuals not already covered by questions above | Count ≥ 50 000 → YES provisional. When any of Q1–Q5 is YES, Q6 gets the flag `Q6_NOT_ALREADY_COVERED_AMBIGUITY` and DPO review is required (CD-04). Not silently treated as NO |
| `SCR-Q7` | Data shared with or accessible by a third party outside EU/EEA (including onward transfers, sub-processors, cloud providers, support teams, group companies) | User-answered; location data in E7 produces a suggestion only. YES → TIA follow-up only |

### Q5 sub-question evaluation

For each sub-question `s` in 5.1–5.6:

- `risk(s)` ∈ {YES, NO, UNRESOLVED} is the user-confirmed answer on whether the **actual risk condition** applies.
  - 5.1: processing may lead to exposure to financial data.
  - 5.2: processing could enable identity theft or fraud **if compromised**. Existence of identity data alone is not enough.
  - 5.3: processing could create a risk to a data subject's property (financial services are named as particular, not exclusive, context).
  - 5.4: processing may lead to discriminatory outcomes (segmentation and restricted access are examples, not prerequisites).
  - 5.5: processing involves personal data of vulnerable data subjects.
  - 5.6: processing involves real-time tracking of location or movement through networks or tracking technologies. Evaluated against its own wording; same two-condition structure.
- `count(s)` = number (or range) of individuals to whom that condition applies. Source examples are guidance only.
- `result(s)`:
  - YES if `risk(s)` = YES and `count(s)` ≥ 10 000 (lower bound).
  - NO if `risk(s)` = NO, or the upper bound of `count(s)` is < 10 000.
  - UNRESOLVED otherwise.
- Consistency check: if `count(s)` exceeds the stated total population, show an inconsistency warning and ask the user to correct or explain. Never adjust silently and never convert to NO.

## Outcomes

| Output | Rule |
|---|---|
| `fullDpiaIndicated` | YES if any of Q1–Q6 is a confirmed YES (`OUT-FULL`) |
| `tiaIndicated` | YES if Q7 is a confirmed YES (`OUT-TIA`). Independent of the full DPIA indication. Q7 alone never indicates a full DPIA |
| `unresolved[]` | List of Q1–Q7 results that are UNRESOLVED, with the reason. Never cancels a positive indication (`OUT-UNRES`) |
| Display wording | "Full DPIA indicated", "TIA follow-up indicated", "Unresolved screening questions". Never "required" until the DPO decides. A NO outcome reads "No screening indication from the template rules". It is not a guarantee a full DPIA is unnecessary, as the DPO may still require one |
| Explanation | Each outcome lists contributing answers, counts, rule IDs and rules version |
| Awaiting review | When indicated and screening not decided: "Full DPIA indicated — awaiting DPO review" |

Suggestions come from rules; the user confirms or overrides with a rationale. The record stores the suggestion, confirmed answer and rationale separately (`SCR-CONFIRM`).

## Conditional activation rules

Hidden answers are kept, marked inactive, and excluded from completeness and active reports. Restored when the condition becomes true again.

| Rule ID | Condition | Activates |
|---|---|---|
| `COND-CHANGED` | A.reason includes Changed processing | `A.changeDescription` |
| `COND-REASON-SPEC` | A.reason includes Mandated by law or Other | `A.reasonSpecify` |
| `COND-JOINT` | B1 has at least one joint controller (not "No joint controllers") | Joint controller rows and responsibilities |
| `COND-PROCESSORS` | B2 not "No processors involved" | Processor and sub-processor records |
| `COND-SPECIAL` | Any purpose category flagged special category | E2 special category rows |
| `COND-CRIMINAL` | Criminal convictions/offence data flagged | `E.sc.criminalAuth` (separate from Art 9 condition) |
| `COND-LIA` | Legitimate interests selected | `E.purpose.lia` |
| `COND-SECONDARY` | E3 applicability = Yes | E3 fields |
| `COND-AI` | F.applies = Yes | F2–F4 |
| `COND-AUTODEC` (provisional) | The source condition ("Required if Section 1.6 is completed") refers to a section that does not exist (CD-01, unresolved). Provisional navigation only: the row is highlighted as likely relevant when F.profiling is Yes or Not sure | The row is always shown with the source wording. "Not applicable" needs a rationale. Not a confirmed source correction |
| `COND-CONSENT` | Any purpose has basis (a) consent | H.r.withdraw active (otherwise "not applicable") |
| `COND-INTL` | Q7 YES, or E7 recipient located outside EU/EEA, or user-flagged | TIA follow-up shown; international transfer fields |
| `COND-FULL` | Screening decision PROCEED_FULL, or DPO requires full | Stages D–K active |
| `COND-HIGH-RES` | Any risk with current residual HIGH (9–16) | Additional actions and specialist review required |
| `COND-CONDITIONAL-APPROVAL` | Owner decision Conditionally approved | Condition records |
| `COND-PERIODIC` | K.review.periodic = Yes | Review date; otherwise "No scheduled review" with rationale |

The full assessment (D–K) stays accessible to the DPO even when screening indicates it is not required.

## Risk rules

| Rule ID | Definition |
|---|---|
| `RISK-SCALE-P` | Probability 1–4: Very low, Low, Medium, High (descriptions in source J.scale.p1–p4) |
| `RISK-SCALE-I` | Impact 1–4: Insignificant, Minor, Severe, Very severe (J.scale.i1–i4) |
| `RISK-SCORE` | Score = probability × impact. Missing probability or impact → "Not assessed", never 0 |
| `RISK-CAT` | Low 1–4, Medium 5–8, High 9–16 |
| `RISK-INHERENT` | Inherent probability × inherent impact |
| `RISK-RESIDUAL` | Current residual = residual probability × residual impact. Reflects implemented measures only; planned measures do not lower it |
| `RISK-TARGET` | Optional target risk after planned measures; shown separately from current residual |
| `RISK-HIGH-RES` | Current residual HIGH requires documented additional actions and specialist review (DPO notified) |
| `RISK-CONSULT` | Implements source statement B (`K.sa.guidance`) only: a prompt for DPO and owner when **current residual** risk remains HIGH after implemented measures and cannot be reduced further. Source statement A (HIGH legend, `J.cat.high.consult`) is displayed as template text and does not drive the flag. A score alone is not a legal determination; the flag concludes nothing (CD-02) |
| `RISK-OVERDUE` | Open measure/action past due date shows "Overdue" and the date, creates one notification per item and due date, and changes no score or decision |
| `RISK-MATRIX` | 4×4 labelled matrix, text label plus colour, listing risks in each cell |

## Workflow rules

| Rule ID | Definition |
|---|---|
| `WF-DPO-MANDATORY` | DPO review mandatory for every assessment, including pre-assessment-only |
| `WF-EXC` | Overriding a full DPIA indication needs exception justification and mitigation controls |
| `WF-BLOCK-HOLD` | Owner cannot record Approved while a DPO blocking issue is unresolved and unreviewed; owner disagreement is preserved |
| `WF-SUBMIT` | Submission needs no structural gaps in applicable content; unresolved answers allowed only with an explanation or question for review |
| `WF-RE-REVIEW` | Substantive change after DPO review needs explicit reopen and renewed review |
| `WF-SCREEN-INVALIDATE` | Changing screening answers after submission invalidates the affected screening decision |
| `WF-OPINION-IMMUTABLE` | Submitted opinions are append-only; amendments are new records |
| `WF-SEPARATION` | Owner cannot be the DPO for their own assessment |
| `WF-DELETE` | Hard delete only a never-submitted draft |

## Change classes

Defined in `docs/architecture.md` §5. The class table lives in `content/rules.ts` as `fieldChangeClass[fieldId]`. A test asserts that every inventory field has a class.


## Implementation status (Stage 3)

Implemented in `src/domain/screening.ts` and `src/domain/riskSummary.ts`, tested locally: `SCR-Q1-THRESHOLD`, `SCR-Q2`, `SCR-Q4`, `SCR-Q5-SUB`, `SCR-Q5-AGG`, `SCR-Q6-THRESHOLD` (with the provisional `Q6_NOT_ALREADY_COVERED` DPO flag), `SCR-Q7` (suggestion only), `OUT-FULL`, `OUT-TIA`, `OUT-UNRES`, `SCR-CONFIRM`, `RISK-SCALE-P/I`, `RISK-SCORE`, `RISK-CAT`, `RISK-INHERENT`, `RISK-RESIDUAL`, `RISK-TARGET`, `RISK-HIGH-RES`, `RISK-CONSULT` (a prompt from current residual HIGH only), `RISK-OVERDUE` (label only; notifications arrive later), `RISK-MATRIX`.

Suggestion heuristics (all suggestions need user confirmation; they never change an answer):

- **Q1** from the distinct special-category/criminal count in 3.1, or No if section 4.2 says no such data.
- **Q2** from its three parts; **Q4** from its two parts; **Q3** has no derived suggestion.
- **Q6** from the total population in 3.1; flagged when the population may be at least 50 000 and any of Q1 to Q5 is confirmed Yes.
- **Q7** from recipient locations in section 4.7 using a short list of illustrative non-EU/EEA names. This is a convenience only; an unrecognised location stays unresolved, never No.

Suggestion preservation: when a screening answer is confirmed or changed, the app stores `{rules, suggested, confirmed}` in a hidden record `C.qN.suggested` next to the answer, and the rationale is the existing `C.qN.rationale` field.

Not yet implemented: submission of the screening for review, the DPO screening decision and exception, and automatic activation of stages D to K from the decision (Stage 4).
