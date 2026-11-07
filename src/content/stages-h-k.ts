import {
  choice,
  collection,
  date,
  field,
  flag,
  info,
  link,
  longtext,
  opt,
  person,
  text,
  yesno,
} from "./build";
import { IMPACT_SCALE, PROBABILITY_SCALE } from "@/domain/risk";
import { STATUS_OPTIONS } from "./stages-e-g";
import type { FieldDef, Item, Option, StageDef } from "./types";

const scaleOptions = (scale: readonly { value: string; label: string; description: string }[]): Option[] =>
  scale.map((s) => ({ value: s.value, label: s.label, description: s.description }));

// ---------------------------------------------------------------- H

interface Row {
  key: string;
  statement: string;
  keyQuestion: string;
  example: string;
}

const PRINCIPLES: Row[] = [
  { key: "fairness", statement: "Fairness — processing must not disadvantage or mislead data subjects", keyQuestion: "Could the processing unfairly disadvantage any individual or group? If automated decisions are used, what safeguards are in place?", example: "fairness review conducted for credit scoring model; no vulnerable groups disproportionately affected" },
  { key: "transparency", statement: "Transparency — data subjects must be clearly informed about how their data is used", keyQuestion: "Are individuals clearly informed about how their data is used? Is the privacy notice accurate and up to date?", example: "privacy notice published on website; updated to reflect loan processing purposes and third-party recipients" },
  { key: "purposeLimitation", statement: "Purpose limitation — data must not be used for a different, incompatible purpose", keyQuestion: "Is the purpose clearly defined? If the data is used for another purpose, has compatibility been assessed? What prevents use beyond the stated purpose?", example: "customer transaction data used only for fraud detection; secondary use for marketing requires separate consent" },
  { key: "minimisation", statement: "Data minimisation — only data that is adequate, relevant and necessary should be processed", keyQuestion: "Has each data field been reviewed to confirm that it is necessary? Could any data be removed or anonymised? Is access limited to those who need it?", example: "date of birth collected but year only sufficient — under review; access limited to credit analysts" },
  { key: "accuracy", statement: "Accuracy — data must be accurate, kept up to date, and corrected without delay", keyQuestion: "How is the data checked for accuracy? How often is it reviewed, who is responsible, and how can individuals request corrections?", example: "income data verified against payroll records annually; customers can update contact details via online banking" },
  { key: "storageLimitation", statement: "Storage limitation — data must not be kept longer than necessary", keyQuestion: "Is a retention period defined for each data category? How is deletion or anonymisation ensured when the data is no longer needed?", example: "loan application data retained for the period required by the applicable law (cite the provision); automated deletion configured in the customer administration system" },
  { key: "integrity", statement: "Integrity and confidentiality — data must be protected against unauthorised access, loss or destruction", keyQuestion: "What measures protect the data against unauthorised access, loss or destruction? How are access rights reviewed and security incidents detected?", example: "data encrypted at rest (AES-256); access reviewed quarterly" },
  { key: "accountability", statement: "Accountability — the controller must be able to demonstrate compliance", keyQuestion: "Is the processing recorded in the Record of Processing Activities (RoPA)? Are the relevant policies documented and kept up to date?", example: "recorded in the RoPA (add reference); data retention policy reviewed annually" },
];

const RIGHTS: (Row & { conditional?: string })[] = [
  { key: "informed", statement: "Right to be informed", keyQuestion: "Are individuals informed about this processing in a clear and accessible way? Where and when is the relevant privacy information provided?", example: "privacy notice published on website and updated to reflect this processing" },
  { key: "accessPortability", statement: "Right of access and data portability", keyQuestion: "Is there a documented process for handling data subject requests? Can the relevant data be retrieved and provided within the applicable deadline and, where required, in a portable format?", example: "DSAR process documented; data export available in CSV format" },
  { key: "rectErasure", statement: "Right to rectification and erasure", keyQuestion: "Can individuals request corrections or deletion of their data? How are these requests handled, and how are relevant recipients notified when necessary?", example: "customer can update contact details in online banking; deletion request triggers workflow to notify all data recipients" },
  { key: "objectRestrict", statement: "Right to object and restriction", keyQuestion: "Is there a process for handling objections and requests to restrict processing? How is processing restricted while a request is being assessed, where required?", example: "objection handling process documented; “restriction” comment is available in the customer administration system" },
  { key: "automated", statement: "Right not to be subject to automated decision-making", keyQuestion: "Where applicable, can an individual request human review, obtain an explanation and challenge the decision? Explain how this works in practice.", example: "credit decisions flagged for human review; customer can request explanation via customer service", conditional: "Required if Section 1.6 is completed" },
  { key: "withdraw", statement: "Right to withdraw consent", keyQuestion: "If consent is the legal basis, can individuals withdraw it as easily as they gave it? How is processing stopped following withdrawal?", example: "consent withdrawn via online banking settings; processing stops within 24 hours", conditional: "Only if lawful basis is consent" },
];

function rowFields(prefix: "H.p" | "H.r", r: Row & { conditional?: string }): Item[] {
  const id = `${prefix}.${r.key}`;
  const statusId = `${id}.status`;
  const conditionalRow = Boolean(r.conditional);
  const hints: FieldDef["hints"] = [];
  if (r.conditional) {
    hints.push({
      when: { all: [] },
      text: `Template note: “${r.conditional}”.${
        r.key === "automated"
          ? " The template refers to a section (1.6) that does not exist; this reference is unresolved and flagged for the template owner."
          : ""
      }`,
    });
  }
  if (r.key === "withdraw") {
    hints.push({
      when: { not: { f: "E.purpose.basis", includes: "a", scope: "any" } },
      text: "No processing purpose currently lists consent as its lawful basis. If this right does not apply, mark it not applicable and explain why.",
    });
  }
  const measures: FieldDef = field(id, r.statement, "longtext", {
    help: {
      essential: true,
      inline: r.keyQuestion,
      example: `Illustration only: ${r.example}`,
    },
    hints,
    activeWhen: conditionalRow ? { not: { f: statusId, stateIn: ["NOT_APPLICABLE"] } } : undefined,
    sourceText: `${r.statement}. ${r.keyQuestion} (Supporting measures in place)`,
  });
  const status: FieldDef = choice(statusId, "Implementation status", STATUS_OPTIONS, {
    added: true,
    allowNA: conditionalRow,
  });
  return [measures, status];
}

export const STAGE_H: StageDef = {
  id: "H",
  title: "Analysis of the processing",
  description: "Minimisation, quality, security, GDPR principles and data subject rights.",
  subsections: [
    {
      id: "H1",
      stage: "H",
      title: "Data minimisation, retention and deletion",
      summary: "Why the data is needed and how long it is kept.",
      items: [
        longtext("H.min.necessary", "Why is this data necessary?", {
          sourceText: "For each category of personal data, explain why it is needed for the stated purpose. Could the purpose be achieved using less data?",
          help: { essential: true, inline: "For each category of personal data, explain why it is needed. Could the purpose be achieved using less data?" },
        }),
        longtext("H.min.retention", "Retention period", {
          sourceText: "State how long the data will be kept. Refer to the relevant law or internal policy, where applicable. If no retention period has been defined, explain why and provide an estimate.",
          help: { essential: true, inline: "State how long the data will be kept and the law or policy you rely on. If none is defined, explain why and give an estimate." },
        }),
        longtext("H.min.deletion", "Deletion or disposal method", {
          sourceText: "Explain how and when the data will be deleted, anonymised or otherwise securely disposed of. Can individual records be deleted if required? Describe any limitations.",
          help: { essential: true, inline: "How and when is data deleted or anonymised? Can single records be deleted? Any limitations?" },
        }),
      ],
    },
    {
      id: "H2",
      stage: "H",
      title: "Data quality",
      summary: "How accuracy and fitness for purpose are ensured.",
      help: {
        explain: "Explain how you ensure that each type of personal data is accurate, relevant and up to date. Describe how the data is checked, how errors are corrected, and who is responsible for maintaining its quality.",
      },
      items: [
        longtext("H.quality.requirements", "Quality requirements: what makes this data accurate and fit for its intended purpose?"),
        longtext("H.quality.assurance", "How is quality ensured?"),
        longtext("H.quality.checks", "What checks or processes are used to verify the data and correct errors?"),
      ],
    },
    {
      id: "H3",
      stage: "H",
      title: "Data security",
      summary: "Where data is held and how it is protected.",
      covers: ["H.sec.audit.example"],
      items: [
        longtext("H.sec.location", "Data location", {
          sourceText: "Identify the systems or assets where the personal data is stored or processed. Include the asset name from the information assets register and the relevant service-desk link.",
          help: { inline: "Name the systems or assets. Add an optional reference or link to where they are recorded; there is no integration." },
        }),
        longtext("H.sec.measures", "Security measures", {
          sourceText: "Describe the technical and organisational measures used to protect the data. For example, explain how access is restricted, whether the data is encrypted, and whether multi-factor authentication (MFA) is required.",
        }),
        yesno("H.sec.dr", "Disaster recovery: is there a disaster recovery or business continuity plan covering the systems that process this data?"),
        longtext("H.sec.dr.description", "Briefly describe the plan and give a link to the documentation", {
          added: true,
          activeWhen: { f: "H.sec.dr", eq: "YES" },
        }),
        yesno("H.sec.audit", "Audit logging: is access to the data logged?", {
          help: { example: "Illustration only: yes — all access logged, retained 12 months, forwarded to a central monitoring system." },
        }),
        longtext("H.sec.audit.description", "What is logged, how long are logs retained, and are they sent to central monitoring?", {
          added: true,
          activeWhen: { f: "H.sec.audit", eq: "YES" },
        }),
      ],
    },
    {
      id: "H4",
      stage: "H",
      title: "Compliance with Article 5 GDPR principles",
      summary: "Measures and implementation status for each principle.",
      covers: ["H.p.intro", "H.status.planned", "H.status.partial", "H.status.implemented", "H.p.examples"],
      intro:
        "For each principle, describe the measures that apply to this processing. The examples are illustrations only, so replace them with the actual controls in place. Select the implementation status that best reflects the current situation.",
      items: PRINCIPLES.flatMap((p) => rowFields("H.p", p)),
    },
    {
      id: "H5",
      stage: "H",
      title: "Measures supporting data subjects’ rights",
      summary: "Measures and implementation status for each right.",
      covers: ["H.r.intro", "H.r.automated.condNote", "H.r.withdraw.condNote", "H.status.na"],
      intro:
        "For each right, describe the measures that apply to this processing. The examples are illustrations only, so replace them with the actual controls in place. Select the implementation status that best reflects the current situation. Two rows can be marked not applicable, with a reason.",
      items: RIGHTS.flatMap((r) => rowFields("H.r", r)),
    },
  ],
};

// ---------------------------------------------------------------- I

const NEC_NOTE =
  "Select Yes or No and explain your answer. Consider whether the processing is necessary to achieve the stated purpose and whether the same purpose could be achieved in a less intrusive way.";
const PROP_NOTE =
  "Select Yes or No and explain your answer. Consider whether the benefits of the processing justify its impact on individuals’ rights and freedoms.";

export const STAGE_I: StageDef = {
  id: "I",
  title: "Necessity and proportionality",
  description: "Whether the processing is necessary and proportionate.",
  subsections: [
    {
      id: "I1",
      stage: "I",
      title: "Necessity",
      summary: "Is the processing necessary for the stated purpose?",
      covers: ["I.nec.intro"],
      intro: NEC_NOTE,
      items: [
        yesno("I.nec.q1", "Are the purposes of the processing clearly defined and documented?", {
          yesMeaning: "favourable",
          yesMeaningText: "Yes means the purposes are clearly defined and documented.",
        }),
        longtext("I.nec.q1.just", "Justification"),
        yesno("I.nec.q2", "Could the same purpose be achieved in a way that interferes less with individuals’ privacy?", {
          yesMeaning: "concern",
          yesMeaningText:
            "Careful: here Yes means a less intrusive way DOES exist, which weighs against necessity. The question and your answer are stored exactly as written.",
        }),
        longtext("I.nec.q2.just", "Justification"),
        yesno("I.nec.q3", "Would individuals reasonably expect their data to be processed in this way?", {
          yesMeaning: "favourable",
          yesMeaningText: "Yes means individuals would reasonably expect it.",
        }),
        longtext("I.nec.q3.just", "Justification"),
        yesno("I.nec.q4", "Have the rights and interests of the individuals been considered?", {
          yesMeaning: "favourable",
          yesMeaningText: "Yes means their rights and interests have been considered.",
        }),
        longtext("I.nec.q4.just", "Justification"),
      ],
    },
    {
      id: "I2",
      stage: "I",
      title: "Proportionality",
      summary: "Do the benefits justify the impact on individuals?",
      covers: ["I.prop.intro"],
      intro: PROP_NOTE,
      items: [
        yesno("I.prop.q1", "Is the personal data limited to what is necessary for the stated purpose?", {
          yesMeaning: "favourable",
          yesMeaningText: "Yes means the data is limited to what is necessary.",
        }),
        longtext("I.prop.q1.just", "Justification"),
        yesno("I.prop.q2", "Is the legal basis for processing clearly identified and documented?", {
          yesMeaning: "favourable",
          yesMeaningText: "Yes means the legal basis is clearly identified and documented.",
        }),
        longtext("I.prop.q2.just", "Justification"),
        yesno("I.prop.q3", "Are retention periods defined, and is the data deleted or anonymised when it is no longer needed?", {
          yesMeaning: "favourable",
          yesMeaningText: "Yes means retention periods are defined and data is deleted or anonymised.",
        }),
        longtext("I.prop.q3.just", "Justification"),
      ],
    },
  ],
};

// ---------------------------------------------------------------- J

export const STAGE_J: StageDef = {
  id: "J",
  title: "Risk assessment and management",
  description: "Risks to individuals, scores, measures and responsibilities.",
  subsections: [
    {
      id: "J1",
      stage: "J",
      title: "Risk scales and matrix",
      summary: "How probability, impact and risk categories are defined.",
      covers: ["J.intro", "J.harm"],
      intro:
        "Identify the potential risks that the processing may create for individuals. For each risk, describe what could go wrong, who could be affected, and what the consequences could be. Assign a probability score and an impact score using the scales below, multiply them to calculate the risk score, record the measures used to reduce the risk and reassess it after those measures. Consequences may include physical, material or non-material harm, such as discrimination, identity theft, financial loss, reputational damage, or other significant economic or social harm.",
      items: [
        info("J.scales", "scales", {
          added: true,
          covers: [
            "J.scale.p1", "J.scale.p2", "J.scale.p3", "J.scale.p4",
            "J.scale.i1", "J.scale.i2", "J.scale.i3", "J.scale.i4",
          ],
        }),
        info("J.matrix.block", "matrix", { added: true, covers: ["J.matrix"] }),
        info("J.legend", "riskLegend", {
          added: true,
          covers: ["J.cat.low", "J.cat.medium", "J.cat.high.mitigation", "J.cat.high.consult", "J.cat.high.suspend"],
        }),
      ],
    },
    {
      id: "J2",
      stage: "J",
      title: "Risk register",
      summary: "One record per risk, with measures and responsibilities.",
      covers: ["J.risk.ex1", "J.risk.ex2", "J.risk.ex3"],
      intro:
        "Describe each risk by what could go wrong, who could be affected and what harm they could suffer. Focus on harm to individuals, not only losses to the organisation. Current residual risk must reflect measures that are already implemented; planned measures belong in the target risk.",
      items: [
        info("J.summary", "riskSummary", { added: true }),
        info("J.examples", "riskExamples", { added: true }),
        collection(
          "J.risk",
          "Risks",
          "Risk",
          [
            text("J.risk.name", "Risk name"),
            text("J.risk.fromExample", "Started from example", { hidden: true, optional: true, added: true }),
            flag("J.risk.confirmed", "I have adapted this example to my processing and confirm it", {
              added: true,
              activeWhen: { f: "J.risk.fromExample", nonEmpty: true, scope: "record" },
            }),
            longtext("J.risk.description", "What could go wrong?", {
              sourceText: "Risk Description — What could happen, who could be affected, and what harm could result?",
            }),
            longtext("J.risk.whoAffected", "Who could be affected?", { added: true }),
            longtext("J.risk.harm", "What harm could they suffer?", { added: true }),
            choice("J.risk.inh.p", "Inherent probability", scaleOptions(PROBABILITY_SCALE)),
            choice("J.risk.inh.i", "Inherent impact", scaleOptions(IMPACT_SCALE)),
            field("J.risk.inh.score", "Inherent risk (probability × impact)", "computed", {
              computed: "inherentScore",
            }),
            collection(
              "J.risk.measure",
              "Mitigation measures (in place or planned)",
              "Measure",
              [
                longtext("J.risk.measures", "Mitigation measure", {
                  sourceText: "Mitigation measures — What measures are in place or planned to reduce the risk?",
                }),
                person("J.risk.owner", "Owner — responsible for implementing and monitoring the measure"),
                date("J.risk.due", "Due date"),
                choice(
                  "J.risk.status",
                  "Status of the measure",
                  [
                    opt("NOT_STARTED", "Not started", "J.risk.status.ns"),
                    opt("IN_PROGRESS", "In Progress", "J.risk.status.ip"),
                    opt("COMPLETED", "Completed", "J.risk.status.c"),
                  ],
                  { changeClass: "PROGRESS" },
                ),
                longtext("J.risk.evidence", "Implementation evidence or notes", {
                  optional: true,
                  added: true,
                  changeClass: "PROGRESS",
                }),
              ],
              { added: true, min: 1, titleField: "J.risk.measures", addLabel: "Add a measure" },
            ),
            choice("J.risk.res.p", "Residual probability (current, after implemented measures)", scaleOptions(PROBABILITY_SCALE)),
            choice("J.risk.res.i", "Residual impact (current, after implemented measures)", scaleOptions(IMPACT_SCALE)),
            field("J.risk.res.score", "Current residual risk (probability × impact)", "computed", {
              computed: "residualScore",
            }),
            choice("J.risk.target.p", "Target probability after planned measures (optional)", scaleOptions(PROBABILITY_SCALE), {
              added: true,
              optional: true,
            }),
            choice("J.risk.target.i", "Target impact after planned measures (optional)", scaleOptions(IMPACT_SCALE), {
              added: true,
              optional: true,
            }),
            field("J.risk.target", "Target risk after planned measures (optional, separate from current residual risk)", "computed", {
              computed: "targetScore",
            }),
            longtext("J.risk.additional", "Additional measures if residual risk is HIGH", {
              sourceText: "What further actions are needed, who is responsible, and by when?",
              activeWhen: { scoreGte: { p: "J.risk.res.p", i: "J.risk.res.i", gte: 9 } },
            }),
            longtext("J.risk.specialist", "Specialist review of the high residual risk", {
              added: true,
              activeWhen: { scoreGte: { p: "J.risk.res.p", i: "J.risk.res.i", gte: 9 } },
            }),
          ],
          { min: 1, titleField: "J.risk.name", addLabel: "Add a risk manually" },
        ),
      ],
    },
  ],
};

// ---------------------------------------------------------------- K

const REVIEW_NOTE = "Recorded by the assigned DPO in Review and decisions.";
const DECISION_NOTE = "Recorded by the process owner in Review and decisions.";

export const STAGE_K: StageDef = {
  id: "K",
  title: "Conclusion and decision",
  description: "DPO review, views of individuals, authority consultation, decision and review schedule.",
  subsections: [
    {
      id: "K1",
      stage: "K",
      title: "DPO review",
      summary: "The DPO’s opinion, conclusions and recommendations.",
      items: [
        info("K.gov", "govStatus", { ref: "opinion", added: true }),
        longtext("K.dpo.opinion", "DPO's opinion, conclusions, and recommendations regarding this processing activity", {
          workflow: "dpo-review",
          workflowNote: REVIEW_NOTE,
          hidden: true,
        }),
        choice(
          "K.dpo.category",
          "Opinion category (a workflow label, not an automated legal conclusion)",
          [
            opt("NO_OBJECTIONS", "No objections"),
            opt("RECOMMENDATIONS", "Recommendations / conditions"),
            opt("OBJECTIONS", "Objections remain"),
          ],
          { added: true, workflow: "dpo-review", workflowNote: REVIEW_NOTE, hidden: true },
        ),
        longtext("K.dpo.blocking", "Blocking issues, with reasons", {
          added: true,
          workflow: "dpo-review",
          workflowNote: REVIEW_NOTE,
          hidden: true,
        }),
      ],
    },
    {
      id: "K2",
      stage: "K",
      title: "Views of data subjects or their representatives",
      summary: "How the views of affected people were obtained, or why not.",
      items: [
        yesno("K.views.sought", "Were the views of data subjects or their representatives sought?", { added: true }),
        longtext("K.views", "Views of data subjects or their representatives", {
          sourceText:
            "Where appropriate, describe how the views of affected individuals or their representatives were obtained and summarise their feedback. If their views were not sought, explain why, where relevant.",
          help: { essential: true, inline: "Describe how views were obtained and summarise feedback, or explain why they were not sought." },
        }),
      ],
    },
    {
      id: "K3",
      stage: "K",
      title: "Consultation with the supervisory authority",
      summary: "Whether the supervisory authority has been consulted.",
      covers: ["K.sa.guidance"],
      help: {
        explain:
          "Template rule: consultation is “Required if residual risks remain HIGH after mitigation measures are applied and cannot be reduced further.” If the supervisory authority has been consulted, describe the reason and record its response or recommendations. A risk score alone does not decide this; the DPO and owner assess it.",
      },
      items: [
        info("K.consult", "consultFlag", { added: true }),
        yesno("K.sa.consulted", "Has the supervisory authority been consulted?"),
        longtext("K.sa.details", "Reason for consultation, and the authority’s response or recommendations", {
          added: true,
          activeWhen: { f: "K.sa.consulted", eq: "YES" },
        }),
        text("K.sa.authorityName", "Name of the supervisory authority (optional)", { added: true, optional: true }),
      ],
    },
    {
      id: "K4",
      stage: "K",
      title: "Final decision and conditions",
      summary: "The owner’s decision after DPO review.",
      items: [
        info("K.govd", "govStatus", { ref: "decision", added: true }),
        choice(
          "K.decision",
          "Final decision",
          [
            opt("APPROVED", "APPROVED: the processing may proceed. The residual risks are acceptable.", "K.decision.approved"),
            opt("CONDITIONAL", "CONDITIONALLY APPROVED: the processing may proceed only once the conditions have been met.", "K.decision.conditional"),
            opt("REJECTED", "REJECTED: the processing must be abandoned.", "K.decision.rejected"),
          ],
          { added: true, workflow: "owner-decision", workflowNote: DECISION_NOTE, hidden: true },
        ),
        longtext("K.decision.reasons", "Reasons for the decision", {
          workflow: "owner-decision",
          workflowNote: DECISION_NOTE,
          hidden: true,
        }),
        collection(
          "K.decision.condition",
          "Conditions",
          "Condition",
          [
            longtext("K.decision.condition.description", "Condition", { added: true }),
            person("K.decision.condition.owner", "Person responsible", { added: true }),
            date("K.decision.condition.deadline", "Deadline", { added: true }),
            longtext("K.decision.condition.evidence", "Completion evidence or explanation", { added: true, optional: true }),
          ],
          {
            workflow: "owner-decision",
            workflowNote: DECISION_NOTE,
            titleField: "K.decision.condition.description",
          },
        ),
      ],
    },
    {
      id: "K5",
      stage: "K",
      title: "Periodic review",
      summary: "Next review date, or no scheduled review.",
      help: {
        explain:
          "Set a next review date, or choose that no review is scheduled and say why. This application does not impose a universal review interval. Changes to this schedule are logged and do not need a new revision.",
      },
      items: [
        yesno("K.review.periodic", "Does this DPIA require periodic assessment?", { changeClass: "ADMINISTRATIVE" }),
        date("K.review.interval", "If YES: date of the next revision", {
          activeWhen: { f: "K.review.periodic", eq: "YES" },
          changeClass: "ADMINISTRATIVE",
          sourceText: "If the answer is YES, please provide the interval / routine / date of the revision",
        }),
        text("K.review.routine", "Interval or routine (optional)", {
          added: true,
          optional: true,
          activeWhen: { f: "K.review.periodic", eq: "YES" },
          changeClass: "ADMINISTRATIVE",
        }),
        longtext("K.review.noSchedule", "No scheduled review: rationale", {
          added: true,
          activeWhen: { f: "K.review.periodic", eq: "NO" },
          changeClass: "ADMINISTRATIVE",
        }),
      ],
    },
    {
      id: "K6",
      stage: "K",
      title: "Assessment version history",
      summary: "Versions of this assessment.",
      items: [
        info("K.history", "versionHistory", {
          added: true,
          covers: ["K.hist.version", "K.hist.date", "K.hist.changes", "K.hist.author", "K.hist.dpo"],
        }),
      ],
    },
    {
      id: "K7",
      stage: "K",
      title: "Additional documentation",
      summary: "References to other documents, and template information.",
      items: [
        collection(
          "K.appx.items",
          "Additional documentation",
          "Document",
          [
            text("K.appx.docs", "Document title"),
            link("K.appx.ref", "Reference or link", { added: true }),
          ],
          { added: true, titleField: "K.appx.docs", addLabel: "Add a document" },
        ),
        info("TPL.provenance", "provenance", {
          added: true,
          covers: ["TPL.doc.v1", "TPL.doc.v2", "TPL.doc.v3"],
        }),
      ],
    },
  ],
};
