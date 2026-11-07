# Source-to-application inventory

Template version tracked: **DPIA template document history v3 (valid from 21.10.2026)**. Application template-definition version: `tpl-1.0.0` (see `template-rules.md`).

Source document: `DPIA_Template.docx` (kept locally, git-ignored, never published). This inventory refers to the source by heading and ordinal, with short labels. It is the authoritative mapping that Stage 2 turns into structured definitions, and a coverage test must fail if any ID below lacks a definition.

## Conventions

**Field IDs** are stable, never reused, never renumbered. Format `<STAGE>.<subsection>.<item>`, for example `C.q5.s1`. Repeatable records use a record ID plus field ID: `E.purposes[]` with fields `E.purposes.purpose`.

**Kinds**

| Kind | Meaning | Stored as |
|---|---|---|
| Q | Source question or input the user answers | User-entered fact |
| T | Table column / field in a source table | User-entered fact (repeatable record field) |
| C | Source choice option (checkbox / radio) | User-entered fact |
| R | Template rule (threshold, compound condition, trigger, requirement) | Versioned rule definition, never user data |
| X | Source explanatory text needed for interpretation | Shown as inline help; also kept in "Explain this" |
| E | Source example | Guidance only. Never prefilled as an answer |
| D | Human decision or review entry (DPO / owner) | Review/decision records |
| P | Template provenance | Template metadata, separate from assessment version history |

**Export rule (applies to every row).** Reports and JSON are generated for one **selected assessment version** (or its snapshot), never a mix of current answers and an earlier opinion or decision.

- **Included for Q/T/C/D rows that are active (applicable) in that version:** the answer, its state (Answered / Unanswered / Not applicable / Not sure / Complete later) and any rationale. Report location: under the subsection heading. JSON location: `responses["<ID>"]` (repeatable records under `records.<collection>[i].<field>`).
- **Inactive (hidden by conditions) answers:** preserved internally and restored if the condition becomes true again. They are **excluded** from active completeness, the active report and active JSON findings. They may appear only in a clearly separate, optional "inactive answers" JSON section (`inactive`), never as active findings.
- **R rows:** shown in the report as "Rule applied" lines with rule ID, rules version and the answers that produced each outcome.
- **X and E rows:** long guidance, explanations and examples are **excluded from reports**. They remain in the application as help. JSON carries field IDs, not help text.
- **Review comments:** excluded by default; included only when "Include review comments" is selected. **Formal DPO opinions, screening decisions and owner decision rationales are always included.**
- **Unfinished versions:** marked "DRAFT". Unanswered and not-applicable items are labelled, never silently dropped.
- **Progress records** created after the selected snapshot are shown separately with timestamps; they never rewrite the snapshot.
- Rows with a different export are noted in the Notes column.

**Answer convention.** For a question row (for example `C.q1`, `I.nec.q1`), the row ID holds the Yes/No (plus Not sure) value; the `.rationale` / `.just` row holds the text. Per-row sub-IDs for table rows that bundle several source cells follow the pattern `<ID>.statement` (source principle/right wording), `<ID>.keyQuestion`, `<ID>.example`, `<ID>.measures`, `<ID>.status`.

**Standard companion fields.** Every Q and T row has a hidden-by-default companion for answer state, rationale (where "Not applicable"/"Not sure" needs one), last editor and edit time, per-field revision.

## Application structure (stages and subsections)

Subsection IDs are stable and are the unit of assignment and navigation.

| Stage | Subsections |
|---|---|
| A General information | A1 Processing, A2 Reason for assessment |
| B Parties | B1 Controllers, B2 Processors and sub-processors |
| C Pre-assessment | C0 Screening inputs (derived facts), C1–C4 individual questions, C5 compound question with 5.1–5.6, C6, C7, C8 Outcomes, C9 DPO screening decision |
| D Rationale and scope | D1 Scope, D2 Launch date |
| E Processing description | E1 Purposes, E2 Special category and criminal offence data, E3 Further use, E4 Nature, E5 Scope, E6 Context, E7 Data sharing |
| F AI processing | F1 Applicability, F2 System description, F3 Profiling and oversight, F4 Classification and fairness |
| G Policies and requirements | G1 Internal policies, G2 External requirements |
| H Processing analysis | H1 Minimisation/retention/deletion, H2 Data quality, H3 Security, H4 Article 5 principles, H5 Data subject rights |
| I Necessity and proportionality | I1 Necessity, I2 Proportionality |
| J Risk assessment | J1 Scales and matrix, J2 Risk register |
| K Conclusion | K1 DPO review, K2 Views of individuals, K3 Supervisory authority, K4 Final decision and conditions, K5 Periodic review, K6 Assessment version history, K7 Additional documentation |

## Preamble and general rules

| ID | Source item | Kind | App location | Notes |
|---|---|---|---|---|
| TPL.intro.purpose | DPIA assesses necessity, proportionality, and risks to individuals | X | Welcome/overview help | |
| TPL.intro.scope | Focus is exclusively personal data; legal-entity and anonymised data out of scope; data on natural persons linked to legal entities (board members, beneficial owners, contacts) is in scope | X + R | Overview help; A1 guidance | Shown as guidance; flagged as template rule, not a statutory test |
| TPL.intro.mandatory | DPIA mandatory for processing likely to result in high risk; pre-assessment first | R | C stage gate; pre-assessment cannot be bypassed | Organisational rule wording preserved; see content decisions CD-02 |
| TPL.intro.when | Complete for new service/system/process or significant change; for existing activities first check whether a DPIA exists; if so update it | R | A2 reason; "Start review / update" flow | Maps to previous-assessment-reference field |
| TPL.intro.timing | Start early, review throughout, finalise before processing begins | R | Overview help; K5 | Informational; no automated enforcement |

## A. General information

| ID | Source item | Kind | App location | Notes |
|---|---|---|---|---|
| A.processingName | Name of the processing | Q | A1 | |
| A.owner | Owner (process, system or service owner responsible) | Q | Assessment header (not a questionnaire item) | The owner is the real `Assessment.ownerId` relationship, never inferred from a role. Shown in the header; exported in the report and JSON (`responses["A.owner"]`, taken from the owner relationship). Changed only by the recorded ownership-transfer action (Stage 4) |
| A.description | General description, brief summary | Q | A1 | |
| A.reason.new | Reason: New processing | C | A2 | Multi-select |
| A.reason.changed | Reason: Changed processing | C | A2 | |
| A.reason.mandated | Reason: Mandated by law | C | A2 | |
| A.reason.other | Reason: Other (e.g. regular review) | C | A2 | |
| A.changeDescription | If "Changed processing" – describe what has changed | Q | A2 | Conditional on A.reason.changed |
| A.reasonSpecify | If "Mandated by law" or "Other" – please specify | Q | A2 | Conditional on A.reason.mandated or A.reason.other |
| A.previousRef | Existing/previous assessment reference | Q | A2 | Implements spec; supports manual entry of Word-era assessments (from TPL.intro.when) |
| A.generatedId | (none in source) | – | System | Generated identifier, not source content |

## B. Parties

| ID | Source item | Kind | App location | Notes |
|---|---|---|---|---|
| B.ctrl.guidance | Controller definition: entity that decides why and how personal data is processed; joint controllers if two or more jointly decide | X | B1 help | Entity list in source (real group names) replaced by Harbour Financial Group entities; see CD-03 |
| B.ctrl[] | Controller / joint controller rows | repeatable | B1 | Shared Party entity |
| B.ctrl.name | Controller name | T | B1 | Select Harbour entity or custom |
| B.ctrl.role | Roles and responsibilities | T | B1 | |
| B.ctrl.noJoint | "If no joint controllers, leave remaining rows blank" | R | B1 | Implemented as explicit "No joint controllers" option |
| B.proc.guidance | Processor definition incl. external providers and group entities acting as processors | X | B2 help | |
| B.proc.example | Controller/processor/sub-processor example (named entities) | E | B2 "Example" | Rewritten with fictional names; guidance only |
| B.proc.none | "If no processors are involved, mark N/A" | R | B2 | Explicit "No processors involved" option; requires no rationale |
| B.proc[] | Processor rows | repeatable | B2 | Shared Party entity |
| B.proc.name | Processor name | T | B2 | |
| B.proc.role | Roles and responsibilities | T | B2 | |
| B.proc.dpaRef | Data processing agreement reference | T | B2 | Optional text/link |
| B.sub[] | Sub-processor rows under each processor (source shows 1.1, 1.2, 2.1, 2.2 as examples of repeats) | repeatable | B2 | Nested under processor; add as needed |
| B.sub.name | Sub-processor name | T | B2 | |
| B.sub.role | Roles and responsibilities | T | B2 | |
| B.sub.dpaRef | DPA reference | T | B2 | |
| B.rows.addAsNeeded | "Add rows as needed" | R | B2 | Repeatable records |

## C. Pre-assessment (screening)

| ID | Source item | Kind | App location | Notes |
|---|---|---|---|---|
| C.q1 | Q1 special category or criminal convictions/offences data relating to 5000 or more individuals | Q + R | C1 | Threshold in rule `SCR-Q1-THRESHOLD` (5000, inclusive) |
| C.q1.sc.list | Special categories listed: health, biometric, genetic, racial/ethnic origin, political opinions, religious beliefs, trade union membership, sex life or sexual orientation | X | C1 help | Not exhaustive wording changes; see CD-06 |
| C.q1.rationale | Rationale | T | C1 | |
| C.q2 | Q2 systematic and extensive evaluation/scoring including profiling, based on automated processing, with legal or similarly significant effects | Q | C2 | Conditions kept compound: systematic and extensive evaluation AND automated AND legal/similarly significant effect |
| C.q2.example | Examples: automated credit scoring, HR ranking, insurance risk, fraud risk profiling | E | C2 | Guidance only |
| C.q2.rationale | Rationale | T | C2 | |
| C.q3 | Q3 new technologies, or existing technologies applied in a new way | Q | C3 | |
| C.q3.example | Examples: ML for creditworthiness, generative AI in unassessed ways, facial recognition in new context | E | C3 | Guidance only |
| C.q3.rationale | Rationale | T | C3 | |
| C.q4 | Q4 systematic and large-scale monitoring of a publicly accessible area | Q | C4 | |
| C.q4.example | Example: CCTV covering public streets | E | C4 | |
| C.q4.rationale | Rationale | T | C4 | |
| C.q5 | Q5 personal data of 10 000 or more individuals AND potentially creating one or more of the following risks | Q + R | C5 | Compound; value is derived from sub-questions, see `SCR-Q5-AGG`. User confirms |
| C.q5.rationale | Rationale for Q5 | T | C5 | |
| C.q5.s1 | 5.1 Processing may lead to exposure to financial data | Q + R | C5 | Two conditions: risk applies AND ≥10 000 individuals to whom it applies |
| C.q5.s1.example | Examples: account statements, tax, pension, assets/liabilities, loan/credit applications, debt collection | E | C5 | Not exclusive |
| C.q5.s1.count | (derived input) number of individuals to whom 5.1 applies | Q | C5 | Approximate / Not sure allowed |
| C.q5.s1.rationale | Rationale | T | C5 | |
| C.q5.s2 | 5.2 Processing could enable identity theft or fraud if compromised | Q + R | C5 | Risk is "enable identity theft/fraud if compromised"; not "identity data exists" |
| C.q5.s2.example | Examples: username/password pairs, national ID, passport/ID card data, authentication credentials | E | C5 | Not exclusive |
| C.q5.s2.count | (derived input) | Q | C5 | |
| C.q5.s2.rationale | Rationale | T | C5 | |
| C.q5.s3 | 5.3 Processing could create a risk to a data subject's property, particularly through financial services | Q + R | C5 | "particularly" means not exclusive |
| C.q5.s3.example | Examples: data enabling unauthorised access to financial accounts, credit cards | E | C5 | |
| C.q5.s3.count | (derived input) | Q | C5 | |
| C.q5.s3.rationale | Rationale | T | C5 | |
| C.q5.s4 | 5.4 Processing may lead to discriminatory outcomes | Q + R | C5 | Segmentation/restricted access are examples, not prerequisites |
| C.q5.s4.example | Example: segmenting by characteristics to assess/predict interests, economic situation, job performance, reliability, behavioural tendencies or browsing to restrict access to services | E | C5 | |
| C.q5.s4.count | (derived input) | Q | C5 | |
| C.q5.s4.rationale | Rationale | T | C5 | |
| C.q5.s5 | 5.5 Processing involves personal data of vulnerable data subjects | Q + R | C5 | |
| C.q5.s5.example | Examples: children and elderly individuals | E | C5 | |
| C.q5.s5.count | (derived input) vulnerable data subjects involved | Q | C5 | |
| C.q5.s5.rationale | Rationale | T | C5 | |
| C.q5.s6 | 5.6 Processing involves real-time tracking of individuals' location or movement through networks or tracking technologies | Q + R | C5 | Checked against its own exact wording; same two-condition structure (decision Q-interview 5) |
| C.q5.s6.example | Examples: real-time location via mobile/telecom services; computer activity monitoring software | E | C5 | Scope of computer activity monitoring flagged: CD-07 |
| C.q5.s6.count | (derived input) individuals tracked | Q | C5 | |
| C.q5.s6.rationale | Rationale | T | C5 | |
| C.q6 | Q6 any other personal data relating to 50 000 or more individuals not already covered by questions above | Q + R | C6 | Threshold rule `SCR-Q6-THRESHOLD`; "not already covered" flagged CD-04 |
| C.q6.rationale | Rationale | T | C6 | |
| C.q7 | Q7 data shared with or accessible by a third party outside the EU/EEA | Q + R | C7 | Triggers TIA follow-up only; never triggers full DPIA by itself |
| C.q7.scopeNote | Includes onward transfer to sub-processors, cloud providers, support teams, group companies outside EU/EEA | X | C7 help + guidance | Preserved in "Explain this" |
| C.q7.tiaNote | A Yes triggers a Transfer Impact Assessment, separate from and additional to any DPIA | R | C8 outcome | |
| C.q7.rationale | Rationale | T | C7 | |
| C.inputs.population | (derived input) approximate total individuals | Q | C0 | Time period and scope fields included |
| C.inputs.specialCount | (derived input) individuals with special category or criminal data (no double counting) | Q | C0 | |
| C.out.noYes | Outcome: No 'Yes' answers – pre-assessment complete, no full DPIA required based on screening | R | C8 | Shown as "No screening indication" with caveat that DPO may still require full assessment; not a guarantee |
| C.out.fullDpia | Outcome: Q1–6 one or more Yes – likely high risk, full DPIA required unless DPO records justified exception | R | C8 | Shown as "Full DPIA indicated"; DPO exception per C.dec |
| C.out.tia | Outcome: Q7 Yes – TIA required | R | C8 | Shown as "TIA follow-up indicated" |
| C.out.unresolved | (derived) unresolved screening questions | R | C8 | Added output; spec |
| C.exception.rationale | Rationale and mitigation controls (if full DPIA deemed unnecessary despite Yes) | D | C9 | Required for exception; split: justification + mitigation controls |
| C.dpo.advice | DPO advice or recommendations | D | C9 | |
| C.dpo.mayRequire | DPO may require a full DPIA regardless (significant risks, code of conduct, national law) | R | C9 | |
| C.dec.proceed | Decision: proceed to full assessment | D | C9 | |
| C.dec.sufficient | Decision: pre-assessment sufficient, no full DPIA required | D | C9 | Requires exception rationale when screening indicated full DPIA |
| C.dec.dpoName | DPO name | D | C9 | System-filled from assigned DPO |
| C.dec.date | Date | D | C9 | System-filled |

## D. Full assessment rationale and scope

| ID | Source item | Kind | App location | Notes |
|---|---|---|---|---|
| D.scope.included | Scope: what is included in this assessment | Q | D1 | |
| D.scope.otherDpia | If part covered by separate DPIA: reference and explain what is excluded and why | Q | D1 | Split: reference (optional text/link), exclusion explanation |
| D.scope.excluded | (derived from above) exclusions | Q | D1 | Split input, see CD-09 |
| D.launchDate | Estimated launch date | Q | D2 | Date format validated after interaction |

## E. Description of the processing

| ID | Source item | Kind | App location | Notes |
|---|---|---|---|---|
| E.intro.detail | Description must be specific enough for an unfamiliar reader; vague summaries insufficient | R + X | E help | Deterministic vagueness hints only (CD-10) |
| E.intro.perPurpose | Complete the table for each processing purpose | R | E1 | Repeatable purposes |
| E.purposes[] | Purpose rows (1.1 Description of the processing) | repeatable | E1 | |
| E.purpose.purpose | Purpose: what it achieves, why needed, what if not carried out, benefits for organisation and individuals | T | E1 | Split into sub-inputs: aim, necessity, consequence if not done, benefits (original retained as reference) |
| E.purpose.subjects | Data subject category: identify whose personal data is processed | T | E1 | Selectable options + custom |
| E.purpose.subjects.example | Examples: customers, employees, job applicants or other individuals | E | E1 | Seed list of selectable options, not prefilled answers |
| E.purpose.categories | Personal data category: list the specific data collected or used; avoid broad terms such as "contact details" | T | E1 | Shared DataCategory entity; vagueness hint |
| E.purpose.categories.example | Examples: name, email address, phone number, date of birth | E | E1 | Seed list of selectable options, not prefilled answers |
| E.purpose.basis | Lawful basis, Art 6(1) GDPR | T | E1 | Choices below |
| E.purpose.basis.a | (a) Consent: data subject has given consent for one or more specific purposes | C | E1 | Option label and full source meaning both shown |
| E.purpose.basis.b | (b) Contract: processing is necessary for the performance of a contract with the data subject, or to take pre-contractual steps at their request | C | E1 | |
| E.purpose.basis.c | (c) Legal obligation: processing is necessary to comply with a legal obligation of the controller | C | E1 | |
| E.purpose.basis.d | (d) Vital interests: processing is necessary to protect the vital interests of the data subject or another person | C | E1 | |
| E.purpose.basis.e | (e) Public task: processing is necessary for the performance of a task carried out in the public interest | C | E1 | |
| E.purpose.basis.f | (f) Legitimate interests: processing is necessary for the legitimate interests of the controller or a third party, unless overridden by the data subject's rights | C | E1 | |
| E.purpose.justification | Justification: why basis applies; cite relevant law and section, assessment or contract; for LI reference the LIA; for contract specify type | T | E1 | Source example cites an Estonian "AML Act": preserved only in this inventory and CD-05 |
| E.purpose.lia | Reference to legitimate interest assessment | T | E1 | Optional text/link, conditional on basis (f) |
| E.purpose.art6Ref | "Refer to Article 6(1) GDPR for full text" | X | E1 help | |
| E.purpose.seeSection | "If special category or criminal data, also complete Section 1.2" | R | E1 → E2 | Drives E2 activation |
| E.sc.guidance | 1.2 Complete if special category or criminal conviction/offence data; select categories, identify legal condition, explain in Justification | X + R | E2 | |
| E.sc.categories | Special categories of personal data (checkboxes) | C | E2 | Per row |
| E.sc.cat.revealing | Data revealing racial or ethnic origin, political opinions, religious or philosophical beliefs, or trade union membership | C | E2 | One source option; sub-selectable into four items (CD-06) |
| E.sc.cat.genetic | Genetic data | C | E2 | |
| E.sc.cat.biometric | Biometric data for the purpose of uniquely identifying a natural person | C | E2 | |
| E.sc.cat.health | Data concerning health | C | E2 | |
| E.sc.cat.sexlife | Data concerning sex life or sexual orientation | C | E2 | |
| E.sc.cat.criminal | Data relating to criminal convictions and offences | C | E2 | Listed with special categories in source; authorisation kept separate from Art 9 (CD-08) |
| E.sc.cond | Conditions for processing special category data, Art 9(2) | T | E2 | Choices below |
| E.sc.cond.a | (a) Explicit consent: data subject has given explicit consent for one or more specified purposes | C | E2 | Option label and full source meaning both shown |
| E.sc.cond.b | (b) Employment and social security law: processing is necessary under EU or Member State law in the employment context | C | E2 | |
| E.sc.cond.c | (c) Vital interests: processing is necessary to protect vital interests where the data subject cannot consent | C | E2 | |
| E.sc.cond.d | (d) Legitimate activities: processing by a not-for-profit body relating to its members or regular contacts | C | E2 | |
| E.sc.cond.e | (e) Manifestly public data: data subject has manifestly made the data public | C | E2 | |
| E.sc.cond.f | (f) Legal claims: processing is necessary for establishing, exercising or defending legal claims | C | E2 | |
| E.sc.cond.g | (g) Substantial public interest: based on Union or Member State law with proportionate safeguards | C | E2 | |
| E.sc.cond.h | (h) Health and social care: processing by health professionals under professional secrecy obligations | C | E2 | |
| E.sc.cond.i | (i) Public health: processing necessary for public health reasons under EU or Member State law | C | E2 | |
| E.sc.cond.j | (j) Archiving, research or statistics: processing necessary for archiving, scientific/historical research or statistical purposes | C | E2 | |
| E.sc.art9Ref | "For the full legal text, refer to Article 9(2) GDPR" | X | E2 help | EU-level article reference kept in the interface |
| E.sc.justification | Justification | T | E2 | |
| E.sc.criminalAuth | (derived) separate authorisation explanation for criminal conviction/offence data | Q | E2 | Added field; separate from Art 9 condition (spec; CD-08) |
| E.sc.addRow | [Add row if multiple special category data types] | R | E2 | Repeatable |
| E.sec.guidance | Further use (secondary/compatible uses): complete only if applicable, otherwise N/A | X + R | E3 | Explicit applicability choice |
| E.sec.question | Explain whether data will be used for any other purpose than originally collected | Q | E3 | |
| E.sec.newPurpose | Describe new purpose, assess compatibility, explain, identify any additional legal basis required | Q | E3 | Split: new purpose, compatibility assessment, additional legal basis |
| E.sec.example | Example: customer contact details collected for existing relationships later used to inform of new product | E | E3 | |
| E.sec.uses | Secondary or compatible uses of the data | T | E3 | Repeatable |
| E.sec.categories | Personal data category | T | E3 | Shared DataCategory |
| E.nature | Nature of the processing: lifecycle – collection and source, use and systems, sharing, retention and disposal | Q | E4 | Split into four inputs; original retained as reference |
| E.nature.docRef | Reference existing data flow diagram / process description (source names a wiki tool) | Q | E4 | Optional text/link; no integration |
| E.nature.example | Example: loan application data lifecycle | E | E4 | |
| E.scope | Scope of the processing: number of individuals, volume and frequency, retention, countries/regions | Q | E5 | Split into four inputs |
| E.scope.example | Example: ~50,000 records monthly... retained under AML Act... Estonian residents only | E | E5 | Neutral replacement; original preserved in inventory only |
| E.context | Context: relationship with individuals, reasonable expectation, vulnerable individuals, new/unusual/sensitive | Q | E6 | Split into four inputs |
| E.context.example | Example: existing customers, fraud detection expectation, automated decision-making | E | E6 | |
| E.share.guidance | Data sharing: list all recipients, including group entities, providers, processors, sub-processors; per recipient what data, how transferred, where stored/accessed, agreement | X + R | E7 | |
| E.share.none | "If no data is shared, write N/A" | R | E7 | Explicit "No data shared" option |
| E.share[] | Recipient rows | repeatable | E7 | Recipient is a shared Party |
| E.share.name | Recipient name | T | E7 | |
| E.share.categories | Personal data category | T | E7 | Shared DataCategory |
| E.share.method | Transfer method (e.g. API, e-mail, shared system) | T | E7 | |
| E.share.location | Data location (country / region) | T | E7 | Informs Q7 suggestion |
| E.share.agreement | Agreement in place? Yes / No | T | E7 | Tri-state with Not sure |
| E.share.agreementRef | Agreement reference (link in internal repository, or draft details) | T | E7 | Optional text/link |

## F. AI processing

| ID | Source item | Kind | App location | Notes |
|---|---|---|---|---|
| F.applies | "Complete only if processing involves AI, otherwise mark N/A" | R | F1 | Explicit Yes / No / Not sure |
| F.type | AI type: predictive model, LLM, generative AI tool, scoring model | Q | F2 | |
| F.purpose | Purpose: what it does, why used instead of or alongside non-AI | Q | F2 | |
| F.role | Role in process: recommendation to human or decision without human intervention | Q | F2 | |
| F.role.example | Example: scoring model suggests, loan officer decides | E | F2 | |
| F.io | Data inputs and outputs | Q | F2 | Split: inputs, outputs |
| F.io.example | Example: input transaction history/income; output risk score | E | F2 | |
| F.profiling | Profiling or automated decision-making with legal/similarly significant effects: Yes / No + explanation | Q | F3 | Drives H5 automated-decision right applicability; adds Not sure |
| F.oversight | Human oversight option | C | F3 | |
| F.oversight.hitl | Human-in-the-loop – human approves before decision is finalised | C | F3 | |
| F.oversight.hotl | Human-on-the-loop (or Human Review) – human can review and override after | C | F3 | |
| F.oversight.full | Fully automated – no human intervention | C | F3 | |
| F.oversight.explain | Explain how a human is involved | Q | F3 | |
| F.class | EU AI Act risk classification (user-declared) | C | F4 | Plus "Not yet assessed / unsure"; never computed |
| F.class.unacceptable | Unacceptable risk (prohibited) | C | F4 | |
| F.class.high | High risk (requires conformity assessment) | C | F4 | |
| F.class.limited | Limited risk (transparency obligations apply) | C | F4 | |
| F.class.minimal | Minimal risk | C | F4 | |
| F.class.rationale | (added) basis for declared classification | Q | F4 | Optional |
| F.bias | Bias and fairness: what tested, how often, measures for issues | Q | F4 | Split: what is tested, frequency, remediation |
| F.bias.example | Example: bias testing on training data, fairness metrics, third-party audit | E | F4 | |

## G. Policies and requirements

| ID | Source item | Kind | App location | Notes |
|---|---|---|---|---|
| G.internal.status | Internal policies compliance: Yes / Partially / No | Q | G1 | Plus Not sure |
| G.internal.policyRef | If Yes, refer to the policy | Q | G1 | Conditional on Yes |
| G.internal.gaps | If Partially/No explain what is missing and planned actions | Q | G1 | Split: gaps, planned actions |
| G.internal.example | Examples: privacy, cookie, IT, information security, retention policies | E | G1 | |
| G.external.status | External requirements: Yes / No | Q | G2 | |
| G.external.list | If Yes identify applicable requirements and explain how addressed | Q | G2 | Repeatable (requirement + explanation) |
| G.external.example | Examples: EBA guidelines, PCI-DSS, ISO 27001 | E | G2 | |

## H. Analysis of the processing

| ID | Source item | Kind | App location | Notes |
|---|---|---|---|---|
| H.min.necessary | 2.1 Why is this data necessary (per category); could less data achieve the purpose? | Q | H1 | Per shared DataCategory |
| H.min.retention | Retention period; law or policy; if none defined explain why and estimate | Q | H1 | |
| H.min.deletion | Deletion/disposal method: how and when; record-level deletion; limitations | Q | H1 | |
| H.quality.requirements | 2.2 Quality requirements: what makes data accurate and fit for purpose | Q | H2 | |
| H.quality.assurance | How is quality ensured | Q | H2 | |
| H.quality.checks | What checks verify data and correct errors; who is responsible | Q | H2 | |
| H.sec.location | 2.3 Data location: systems/assets storing or processing; asset name from asset registry and ticket link | Q | H3 | Optional text/link, no integration; named registries replaced |
| H.sec.measures | Security measures: access restriction, encryption, MFA | Q | H3 | |
| H.sec.dr | Disaster recovery / continuity plan: yes + description + documentation link | Q | H3 | Tri-state + description |
| H.sec.audit | Audit logging: is access logged; what, retention, central monitoring | Q | H3 | Tri-state + description |
| H.sec.audit.example | Example: all access logged, retained 12 months, forwarded to SIEM | E | H3 | |
| H.p.intro | 2.4 Describe measures per Article 5 principle; replace examples with actual controls; select status | X | H4 help | |
| H.p.fairness | Fairness principle: key question, supporting measures, status | Q + T | H4 | Each principle row: key question (X, source), example (E), measures (Q), status (C) |
| H.p.transparency | Transparency | Q + T | H4 | |
| H.p.purposeLimitation | Purpose limitation | Q + T | H4 | |
| H.p.minimisation | Data minimisation | Q + T | H4 | |
| H.p.accuracy | Accuracy | Q + T | H4 | |
| H.p.storageLimitation | Storage limitation | Q + T | H4 | |
| H.p.integrity | Integrity and confidentiality | Q + T | H4 | |
| H.p.accountability | Accountability (record of processing activities, policy documentation) | Q + T | H4 | |
| H.status.planned | Status option: planned | C | H4, H5 | Common option set: planned / partially implemented / implemented, plus Not sure |
| H.status.partial | Status option: partially implemented | C | H4, H5 | |
| H.status.implemented | Status option: implemented | C | H4, H5 | |
| H.p.examples | Per-principle examples (bracketed in source) | E | H4 | Neutralised; guidance only |
| H.r.intro | Measures supporting data subject rights; describe, select status | X | H5 help | |
| H.r.informed | Right to be informed | Q + T | H5 | Fields as for principles |
| H.r.accessPortability | Right of access and data portability | Q + T | H5 | |
| H.r.rectErasure | Right to rectification and erasure | Q + T | H5 | |
| H.r.objectRestrict | Right to object and restriction | Q + T | H5 | |
| H.r.automated | Right not to be subject to automated decision-making | Q + T | H5 | Conditional (rule `COND-AUTODEC`); status adds "not applicable" |
| H.r.automated.condNote | "Required if Section 1.6 is completed" | R | H5 | **Unresolved source reference**: the template has no Section 1.6. The source text is displayed verbatim. AI processing / profiling (F) is only a provisional navigation interpretation, not a confirmed correction; CD-01 |
| H.r.withdraw | Right to withdraw consent | Q + T | H5 | Conditional on basis (a) anywhere (rule `COND-CONSENT`); status adds "not applicable" |
| H.r.withdraw.condNote | "Only if lawful basis is consent" | R | H5 | |
| H.status.na | Status option: not applicable | C | H5 | Only for the two conditional rows (source) |

## I. Necessity and proportionality

| ID | Source item | Kind | App location | Notes |
|---|---|---|---|---|
| I.nec.intro | For each question select Yes/No and explain; consider less intrusive means | X | I1 help | |
| I.nec.q1 | Purposes clearly defined and documented? | Q | I1 | Yes/No (+ Not sure) |
| I.nec.q1.just | Justification | T | I1 | |
| I.nec.q2 | Could same purpose be achieved in a way that interferes less with privacy? | Q | I1 | Direction of "Yes" preserved; guidance explains |
| I.nec.q2.just | Justification | T | I1 | |
| I.nec.q3 | Would individuals reasonably expect processing this way? | Q | I1 | |
| I.nec.q3.just | Justification | T | I1 | |
| I.nec.q4 | Rights and interests of individuals considered? | Q | I1 | |
| I.nec.q4.just | Justification | T | I1 | |
| I.prop.intro | For each question select Yes/No, explain; consider whether benefits justify impact | X | I2 help | |
| I.prop.q1 | Personal data limited to what is necessary? | Q | I2 | |
| I.prop.q1.just | Justification | T | I2 | |
| I.prop.q2 | Legal basis clearly identified and documented? | Q | I2 | |
| I.prop.q2.just | Justification | T | I2 | |
| I.prop.q3 | Retention periods defined; data deleted/anonymised when no longer needed? | Q | I2 | |
| I.prop.q3.just | Justification | T | I2 | |

## J. Risk assessment and management

| ID | Source item | Kind | App location | Notes |
|---|---|---|---|---|
| J.intro | Identify risks to individuals: what could go wrong, who affected, consequences; score P×I; record measures; reassess | X + R | J help, J2 | |
| J.harm | Consequences: physical, material or non-material harm (discrimination, identity theft, financial loss, reputational damage, other significant economic or social harm) | X | J1 help | |
| J.scale.p1–p4 | Probability scale levels 1 Very low, 2 Low, 3 Medium, 4 High with descriptions | R | J1, J2 | Descriptions beside choices; frequency hints once per 100 y / 10 y / year / every 1–2 months preserved |
| J.scale.i1–i4 | Impact scale levels 1 Insignificant, 2 Minor, 3 Severe, 4 Very severe with descriptions | R | J1, J2 | Parenthetical effect labels preserved |
| J.matrix | Risk matrix impact (rows) vs probability (columns), 16 cells with scores and categories | R | J1 | Computed, labelled 4×4 |
| J.cat.low | LOW 1–4: Acceptable, monitor and review periodically; no immediate action; schedule periodic review | R | J1 | |
| J.cat.medium | MEDIUM 5–8: Mitigate and document decisions; record rationale | R | J1 | |
| J.cat.high.mitigation | HIGH (9–16): "Implementation of mitigation measures is mandatory." | R | J1 | Implemented for inherent and residual HIGH: additional actions required |
| J.cat.high.consult | HIGH (9–16): "Prior consultation with the supervisory authority (named authority) is required." | R | J1 legend | **Source statement A (score-based).** Displayed verbatim as template text with the authority name replaced by "supervisory authority". Not used to compute a consultation flag from an inherent score. See CD-02 |
| J.cat.high.suspend | HIGH (9–16): "Where risks cannot be sufficiently mitigated, processing may need to be suspended or abandoned." | R | J1 legend | Displayed as template text |
| J.risk[] | Risk register rows | repeatable | J2 | |
| J.risk.name | Risk name | T | J2 | |
| J.risk.description | Risk description: what could happen, who affected, what harm | T | J2 | Split: what could go wrong, who could be affected, what harm |
| J.risk.ex1 | Example 1: "Processing without legal basis": data subjects have no knowledge their data is used, no ability to consent, object or exercise rights. Inherent 3×2=6 MEDIUM; measures: disclaimer on personal data processing, link to privacy policy; residual 2×2=4 LOW; additional measures n/a | E | J2 "Choose a risk example" | Must be adapted and confirmed; never counted as a real risk |
| J.risk.ex2 | Example 2: "Unauthorised access by third party": data leaked or stolen via cyberattack; data subject could become target of fraud. Inherent 3×4=12 HIGH; measures: encryption at rest and in transit, DLP tools; residual 2×4=8 MEDIUM; additional measures described | E | J2 | Same |
| J.risk.ex3 | Example 3: "Third-Party Processor Risk": processor fails to provide adequate security or compliance guarantees. Inherent 4×4=16 HIGH; residual 3×4=12 HIGH; additional measures described | E | J2 | Same. Residual HIGH illustrates the additional-actions requirement |
| J.risk.inh.p | Inherent probability | T | J2 | 1–4 |
| J.risk.inh.i | Inherent impact | T | J2 | 1–4 |
| J.risk.inh.score | Inherent risk (P×I and category) | T | J2 | Computed server-side |
| J.risk.measures | Mitigation measures (in place or planned) | T | J2 | Repeatable measure records |
| J.risk.res.p | Probability (residual) | T | J2 | 1–4 |
| J.risk.res.i | Impact (residual) | T | J2 | 1–4 |
| J.risk.res.score | Residual risk (P×I and category) | T | J2 | Reflects implemented measures only (spec) |
| J.risk.target | (added) optional target risk after planned measures | T | J2 | Separate from residual |
| J.risk.additional | Additional measures if residual risk is HIGH: further actions, who, by when | T | J2 | Required when current residual HIGH |
| J.risk.owner | Owner: responsible for implementing and monitoring | T | J2 | Demo user or free text |
| J.risk.status | Status of mitigation measures: Not started / In Progress / Completed | T | J2 | |
| J.risk.status.ns | Not started | C | J2 | |
| J.risk.status.ip | In Progress | C | J2 | |
| J.risk.status.c | Completed | C | J2 | |
| J.risk.due | Due date | T | J2 | |
| J.risk.evidence | (added) implementation evidence/notes | T | J2 | Progress record |

## K. Conclusion and decision

| ID | Source item | Kind | App location | Notes |
|---|---|---|---|---|
| K.dpo.opinion | DPO's opinion, conclusions and recommendations | D | K1 | Opinion category label added; immutable once submitted |
| K.dpo.category | (added) No objections / Recommendations-conditions / Objections remain | D | K1 | Workflow label |
| K.dpo.blocking | (added) blocking issues with reason | D | K1 | |
| K.views | Views of data subjects or representatives: how obtained and feedback; or why not sought | Q | K2 | Structured: sought yes/no/not applicable + description or rationale |
| K.sa.guidance | Consultation with the supervisory authority (named authority): "Required if residual risks remain HIGH after mitigation measures are applied and cannot be reduced further." | R | K3 | **Source statement B (residual-based).** Used for the computed consultation flag (current residual HIGH, unresolved). Never from an inherent score; see CD-02 |
| K.sa.consulted | Has authority been consulted; reason and response/recommendations | Q | K3 | Authority name optional (see CD-05) |
| K.decision | Final decision | D | K4 | |
| K.decision.approved | APPROVED: may proceed, residual risks acceptable | D | K4 | |
| K.decision.conditional | CONDITIONALLY APPROVED: may proceed only once conditions met | D | K4 | |
| K.decision.rejected | REJECTED: processing must be abandoned | D | K4 | |
| K.decision.condition[] | Conditions: each with person responsible and deadline | D | K4 | Added: description, completion evidence, owner confirmation |
| K.decision.reasons | Explain reasons for decision | D | K4 | Required; rationale |
| K.review.periodic | Does this DPIA require periodic assessment? YES / NO | Q | K5 | Mapped to review date or "No scheduled review" + rationale |
| K.review.interval | If YES provide interval / routine / date of revision | Q | K5 | Date field; free text for routine |
| K.hist.version | Review & version history: version | T | K6 | Assessment version, system-managed |
| K.hist.date | Completion date | T | K6 | |
| K.hist.changes | Changes made | T | K6 | Source row "Initial draft" is a default value for v1.0 |
| K.hist.author | Author | T | K6 | |
| K.hist.dpo | Reviewed by (DPO) | T | K6 | |
| K.appx.docs | Appendix: additional documentation | Q | K7 | Repeatable title + reference text/link |

## Template provenance (separate from assessment version history)

| ID | Source item | Kind | App location | Notes |
|---|---|---|---|---|
| TPL.doc.v1 | Document history: v1, valid from 01.12.2022, owner: head of compliance (organisation-specific) | P | About / template information page | Stored as template metadata; owner title neutralised in UI, original preserved here |
| TPL.doc.v2 | v2, valid from 06.05.2026, data protection compliance specialist | P | same | |
| TPL.doc.v3 | v3, valid from 21.10.2026, data protection compliance specialist | P | same | |

## Out of inventory by design

The source's decorative layout, empty padding rows, and column widths are not substantive. Word-layout reproduction is phase two.

## UI adaptations (focused simplification; source mappings unchanged)

These change how items are presented, not which source items exist. Every ID above still has a definition (checked by the automated coverage test).

| Item | Adaptation |
|---|---|
| Visible numbering | Sections are shown as 1–11 and subsections as 1.1, 1.2, 2.1 … in order within each section. Internal IDs (A–K, C0 …), routes, stored answers and assignment references are unchanged. |
| `A.generatedId` | Kept and exported; not shown in the questionnaire view or the assessment header. Shown in the register. |
| `A.owner` | Shown in the assessment header only; exported from the owner relationship. |
| `B.ctrl.guidance` | Shown as the single "Guidance" inside each controller record. |
| `B.ctrl.noJoint`, `B.ctrl.kind` | Retired from the screen (hidden fields). Existing values are preserved and exported, never erased or reclassified. Joint controllers are added as further controller records, described in "Roles and responsibilities". |
| `B.ctrl.name` | Single-select "Select" offering Harbour Insurance, Harbour Asset Management and Harbour Bank. Previously saved custom names remain selectable and editable. |
| `B.proc.name`, `B.sub.name` | Entry with reuse of existing entries; no suggestion list. |
| `B.proc.none` | Checkbox kept; its instruction sentence removed (the meaning is carried by the label). |
| Answer-status controls | Not offered in 1.1, 1.2, 2.1 and 2.2. In 2.1 and 2.2 a single "Not sure – I need help" request (with comment) replaces them. An active request keeps the subsection unresolved until cleared. Existing stored states are preserved and shown, with an explicit "Mark as answered" action. |
| `A.previousRef` | Kept; the sentence "Existing assessments are entered manually in this version" removed from the screen. |
| `A.reason` | The prompt "Select all that apply" removed; multi-select behaviour unchanged. |
