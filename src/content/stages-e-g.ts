import {
  choice,
  collection,
  entities,
  entity,
  flag,
  link,
  longtext,
  multi,
  opt,
  text,
  yesno,
} from "./build";
import type { Option, StageDef } from "./types";

export const ART6_BASES: Option[] = [
  opt(
    "a",
    "(a) Consent",
    "E.purpose.basis.a",
    "Data subject has given consent for one or more specific purposes.",
  ),
  opt(
    "b",
    "(b) Contract",
    "E.purpose.basis.b",
    "Processing is necessary for the performance of a contract with the data subject, or to take pre-contractual steps at their request.",
  ),
  opt(
    "c",
    "(c) Legal obligation",
    "E.purpose.basis.c",
    "Processing is necessary to comply with a legal obligation of the controller.",
  ),
  opt(
    "d",
    "(d) Vital interests",
    "E.purpose.basis.d",
    "Processing is necessary to protect the vital interests of the data subject or another person.",
  ),
  opt(
    "e",
    "(e) Public task",
    "E.purpose.basis.e",
    "Processing is necessary for the performance of a task carried out in the public interest.",
  ),
  opt(
    "f",
    "(f) Legitimate interests",
    "E.purpose.basis.f",
    "Processing is necessary for the legitimate interests of the controller or a third party, unless overridden by the data subject's rights.",
  ),
];

export const ART9_CONDITIONS: Option[] = [
  opt("a", "(a) Explicit consent", "E.sc.cond.a", "Data subject has given explicit consent for one or more specified purposes."),
  opt("b", "(b) Employment and social security law", "E.sc.cond.b", "Processing is necessary under EU or Member State law in the employment context."),
  opt("c", "(c) Vital interests", "E.sc.cond.c", "Processing is necessary to protect vital interests where the data subject cannot consent."),
  opt("d", "(d) Legitimate activities", "E.sc.cond.d", "Processing by a not-for-profit body relating to its members or regular contacts."),
  opt("e", "(e) Manifestly public data", "E.sc.cond.e", "Data subject has manifestly made the data public."),
  opt("f", "(f) Legal claims", "E.sc.cond.f", "Processing is necessary for establishing, exercising or defending legal claims."),
  opt("g", "(g) Substantial public interest", "E.sc.cond.g", "Based on Union or Member State law with proportionate safeguards."),
  opt("h", "(h) Health and social care", "E.sc.cond.h", "Processing by health professionals under professional secrecy obligations."),
  opt("i", "(i) Public health", "E.sc.cond.i", "Processing necessary for public health reasons under EU or Member State law."),
  opt("j", "(j) Archiving, research or statistics", "E.sc.cond.j", "Processing necessary for archiving, scientific/historical research or statistical purposes."),
];

export const STATUS_OPTIONS: Option[] = [
  opt("PLANNED", "Planned"),
  opt("PARTIAL", "Partially implemented"),
  opt("IMPLEMENTED", "Implemented"),
];

export const STAGE_E: StageDef = {
  id: "E",
  title: "Description of the processing",
  description: "Purposes, data, lawful bases, lifecycle, scale, context and sharing.",
  subsections: [
    {
      id: "E1",
      stage: "E",
      title: "Purposes, data and lawful basis",
      summary: "One record per processing purpose.",
      intro:
        "Provide a clear, sufficiently detailed description so that a reader unfamiliar with the project can understand what personal data is involved, why it is processed and how. Vague or high-level summaries are not sufficient. Complete one record for each processing purpose.",
      covers: ["E.intro.detail", "E.intro.perPurpose"],
      items: [
        collection(
          "E.purposes",
          "Processing purposes",
          "Purpose",
          [
            longtext("E.purpose.purpose", "What is the processing intended to achieve?", {
              sourceText:
                "Purpose — Explain what the processing is intended to achieve, why it is needed, and what would happen if it were not carried out. Describe the benefits for the organisation and for individuals.",
              help: {
                inline: "Start with the aim. The next three questions cover why it is needed, what happens without it and the benefits.",
                explain:
                  "The template asks for four things about each purpose: what it aims to achieve, why it is needed, what would happen if it were not carried out, and the benefits for the organisation and for individuals. They are split into separate boxes here.",
                example: "Illustration only: “To check each loan application against affordability rules before an offer is made.”",
              },
            }),
            longtext("E.purpose.necessity", "Why is the processing needed?", { added: true }),
            longtext("E.purpose.consequence", "What would happen if it were not carried out?", { added: true }),
            longtext("E.purpose.benefits", "What are the benefits for the organisation and for individuals?", { added: true }),
            entities("E.purpose.subjects", "Data subject category", "DATA_SUBJECT", {
              sourceText: "Data subjects — Identify whose personal data is processed (e.g. customers, employees, job applicants or other individuals).",
              covers: ["E.purpose.subjects.example"],
              help: {
                essential: true, inline: "Whose personal data is processed? Pick from the suggestions or add your own.",
              },
            }),
            entities("E.purpose.categories", "Personal data category", "DATA_CATEGORY", {
              sourceText:
                "Personal data category — List the specific personal data collected or used (e.g. name, email address, phone number or date of birth). Avoid broad terms such as “contact details”.",
              covers: ["E.purpose.categories.example"],
              help: {
                essential: true, inline: "List specific data items, not broad terms such as “customer data” or “contact details”.",
                example: "Illustration only: name, email address, phone number, date of birth.",
              },
            }),
            multi("E.purpose.basis", "Lawful basis — Article 6(1) GDPR", ART6_BASES, {
              covers: ["E.purpose.art6Ref"],
              help: {
                inline: "For the full legal text, refer to Article 6(1) GDPR. Select every basis that applies to this purpose.",
                explain:
                  "If special category data or criminal offence data is processed, also complete the next subsection (special category and criminal offence data).",
              },
            }),
            longtext("E.purpose.justification", "Justification", {
              sourceText:
                "Justification — Explain why the selected legal basis applies. Refer to the relevant law and section, assessment, or contract. For legitimate interest, reference the Legitimate Interest Assessment (LIA); for contract, specify the contract type.",
              help: {
                inline: "Explain why the basis you chose applies.",
                include:
                  "The relevant law and provision, assessment or contract you rely on. Identify the applicable law and provision for your jurisdiction. For legitimate interests, refer to the legitimate interest assessment; for contract, name the type of contract.",
              },
            }),
            link("E.purpose.lia", "Reference to the legitimate interest assessment (LIA)", {
              activeWhen: { f: "E.purpose.basis", includes: "f", scope: "record" },
              help: { inline: "Optional text or link; no integration." },
            }),
          ],
          {
            min: 1,
            titleField: "E.purpose.purpose",
            addLabel: "Add a processing purpose",
            covers: ["E.purpose.seeSection"],
          },
        ),
      ],
    },
    {
      id: "E2",
      stage: "E",
      title: "Special category and criminal offence data",
      summary: "Complete this if the processing involves such data.",
      covers: ["E.sc.guidance", "E.sc.addRow", "E.sc.art9Ref"],
      help: {
        explain:
          "Select all applicable data categories and identify the legal condition that allows the data to be processed. For the full legal text of the conditions, refer to Article 9(2) GDPR. Criminal conviction and offence data needs its own authorisation, which is not one of the Article 9(2) conditions, so it has a separate explanation field below.",
      },
      items: [
        yesno("E.sc.applies", "Does the processing involve special category personal data or data relating to criminal convictions and offences?", {
          added: true,
        }),
        collection(
          "E.sc",
          "Special category and criminal offence data",
          "Data type",
          [
            multi(
              "E.sc.categories",
              "Special categories of personal data",
              [
                opt("revealing", "Data revealing racial or ethnic origin, political opinions, religious or philosophical beliefs, or trade union membership", "E.sc.cat.revealing"),
                opt("genetic", "Genetic data", "E.sc.cat.genetic"),
                opt("biometric", "Biometric data for the purpose of uniquely identifying a natural person", "E.sc.cat.biometric"),
                opt("health", "Data concerning health", "E.sc.cat.health"),
                opt("sexlife", "Data concerning a natural person's sex life or sexual orientation", "E.sc.cat.sexlife"),
                opt("criminal", "Data relating to criminal convictions and offences", "E.sc.cat.criminal"),
              ],
              { added: true },
            ),
            multi(
              "E.sc.revealingDetail",
              "Which of these apply?",
              [
                opt("racial_ethnic", "Racial or ethnic origin"),
                opt("political", "Political opinions"),
                opt("religious", "Religious or philosophical beliefs"),
                opt("trade_union", "Trade union membership"),
              ],
              {
                added: true,
                activeWhen: { f: "E.sc.categories", includes: "revealing", scope: "record" },
              },
            ),
            multi("E.sc.cond", "Conditions for processing special category data — Article 9(2) GDPR", ART9_CONDITIONS, {
              activeWhen: { f: "E.sc.categories", includesOtherThan: "criminal", scope: "record" },
              help: { essential: true, inline: "Select every condition that applies. Criminal offence data is handled separately below." },
            }),
            longtext("E.sc.justification", "Justification", {
              help: { inline: "Explain why the condition applies." },
            }),
            longtext("E.sc.criminalAuth", "Authorisation for criminal conviction and offence data", {
              activeWhen: { f: "E.sc.categories", includes: "criminal", scope: "record" },
              help: {
                inline:
                  "Explain the separate authorisation that allows this data to be processed. This is not satisfied by an Article 9(2) condition.",
              },
            }),
          ],
          {
            added: true,
            titleField: "E.sc.justification",
            addLabel: "Add a data type",
            min: 1,
            activeWhen: { yesOrUnsure: "E.sc.applies" },
          },
        ),
      ],
    },
    {
      id: "E3",
      stage: "E",
      title: "Further use of personal data",
      summary: "Secondary or compatible uses. Complete only if applicable.",
      covers: ["E.sec.guidance", "E.sec.example"],
      help: {
        explain:
          "Explain whether the personal data will be used for any purpose other than the one for which it was originally collected. If so, describe the new purpose and assess whether it is compatible with the original purpose. Explain your assessment and identify any additional legal basis required.",
        example:
          "Illustration only: customer contact details collected to manage existing relationships are later used to inform customers about a new product. Assess whether the new purpose is compatible with the original one; if it is not, a separate legal basis may be required.",
      },
      items: [
        yesno("E.sec.applies", "Will personal data be used for any purpose other than the one for which it was originally collected?", {
          added: true,
          help: { essential: true, inline: "If No, this subsection is not applicable." },
        }),
        longtext(
          "E.sec.question",
          "Explain whether the personal data will be used for any purpose other than the one for which it was originally collected",
          { activeWhen: { yesOrUnsure: "E.sec.applies" } },
        ),
        collection(
          "E.sec.uses",
          "Secondary or compatible uses of the data",
          "Further use",
          [
            longtext("E.sec.newPurpose", "Describe the new purpose"),
            longtext("E.sec.compatibility", "Assess whether it is compatible with the original purpose and explain", {
              added: true,
            }),
            longtext("E.sec.additionalBasis", "Identify any additional legal basis required", { added: true }),
            entities("E.sec.categories", "Personal data category", "DATA_CATEGORY"),
          ],
          {
            titleField: "E.sec.newPurpose",
            addLabel: "Add a further use",
            activeWhen: { yesOrUnsure: "E.sec.applies" },
          },
        ),
      ],
    },
    {
      id: "E4",
      stage: "E",
      title: "Nature of the processing",
      summary: "How personal data is handled throughout its lifecycle.",
      covers: ["E.nature.example"],
      help: {
        explain: "Describe how personal data is handled throughout its lifecycle. If a data flow diagram or process description already exists, add its reference below.",
        example:
          "Illustration only: loan application data is collected via the online portal, stored in the core banking system, shared with a credit bureau for scoring, and deleted ten years after the relationship ends. No manual processing is involved.",
      },
      items: [
        longtext("E.nature", "Nature of the processing — overall summary (optional)", {
          optional: true,
          sourceText:
            "Nature of the processing. Describe how personal data is handled throughout its lifecycle. Explain: how and from whom is the data collected? How is the data used, and which systems store or process it? Who is the data shared with, if anyone? How long is the data kept, and how is it deleted or anonymised?",
        }),
        longtext("E.nature.collection", "How and from whom is the data collected?", { added: true }),
        longtext("E.nature.use", "How is the data used, and which systems store or process it?", { added: true }),
        longtext("E.nature.sharing", "Who is the data shared with, if anyone?", { added: true }),
        longtext("E.nature.retention", "How long is the data kept, and how is it deleted or anonymised?", { added: true }),
        link("E.nature.docRef", "Reference to an existing data flow diagram or process description", {
          help: { inline: "Optional text or link to where it is kept." },
        }),
      ],
    },
    {
      id: "E5",
      stage: "E",
      title: "Scope of the processing",
      summary: "The scale of the processing.",
      covers: ["E.scope.example"],
      help: {
        example:
          "Illustration only: approximately 50 000 customer records processed monthly; data includes name, ID number, income and transaction history; retained for the period required by the applicable law; processing covers residents of one country only.",
      },
      items: [
        longtext("E.scope", "Scope of the processing — overall summary (optional)", {
          optional: true,
          sourceText:
            "Scope of the processing. Describe the scale of the processing. Explain: approximately how many individuals are affected? How much personal data is processed, and how often? How long is the data retained? Which countries or regions does the processing cover?",
        }),
        longtext("E.scope.individuals", "Approximately how many individuals are affected?", { added: true }),
        longtext("E.scope.volume", "How much personal data is processed, and how often?", { added: true }),
        longtext("E.scope.retention", "How long is the data retained?", { added: true }),
        longtext("E.scope.regions", "Which countries or regions does the processing cover?", { added: true }),
      ],
    },
    {
      id: "E6",
      stage: "E",
      title: "Context of the processing",
      summary: "The circumstances in which personal data is processed.",
      covers: ["E.context.example"],
      help: {
        example:
          "Illustration only: data subjects are existing customers who provided data during onboarding. They would reasonably expect their transaction data to be used for fraud detection. No vulnerable groups are involved. Automated decision-making is used, which may be unexpected by some customers.",
      },
      items: [
        longtext("E.context", "Context of the processing — overall summary (optional)", {
          optional: true,
          sourceText:
            "Context of the processing. Describe the circumstances in which the personal data is processed. Explain: what is your relationship with the individuals whose data is processed? Would they reasonably expect their data to be used in this way? Does the processing involve vulnerable individuals, such as children or elderly people? Is the processing new, unusual or particularly sensitive?",
        }),
        longtext("E.context.relationship", "What is your relationship with the individuals whose data is processed?", { added: true }),
        longtext("E.context.expectation", "Would they reasonably expect their data to be used in this way?", { added: true }),
        longtext("E.context.vulnerable", "Does the processing involve vulnerable individuals, such as children or elderly people?", { added: true }),
        longtext("E.context.sensitivity", "Is the processing new, unusual or particularly sensitive?", { added: true }),
      ],
    },
    {
      id: "E7",
      stage: "E",
      title: "Data sharing",
      summary: "Everyone who receives or can access the data.",
      covers: ["E.share.guidance"],
      help: {
        explain:
          "List all organisations or individuals who receive or can access the personal data. Include other group entities, external service providers, processors and sub-processors. For each recipient specify what data they receive, how it is transferred, where it is stored or accessed, and whether an agreement is in place.",
      },
      items: [
        flag("E.share.none", "No data is shared", {
          completeWhen: { hasRecords: "E.share" },
          help: { essential: true, inline: "Tick this if no data is shared; otherwise add each recipient below." },
        }),
        collection(
          "E.share",
          "Recipients",
          "Recipient",
          [
            entity("E.share.name", "Recipient name", "PARTY"),
            entities("E.share.categories", "Personal data category", "DATA_CATEGORY"),
            text("E.share.method", "Transfer method (e.g. API, e-mail, shared system)"),
            text("E.share.location", "Data location (country / region)"),
            yesno("E.share.agreement", "Agreement in place?"),
            link("E.share.agreementRef", "Agreement reference (link in the internal repository, or draft details)"),
          ],
          {
            titleField: "E.share.name",
            addLabel: "Add a recipient",
            activeWhen: { not: { f: "E.share.none", eq: true } },
          },
        ),
      ],
    },
  ],
};

const AI_ACTIVE = { yesOrUnsure: "F.applies" } as const;

export const STAGE_F: StageDef = {
  id: "F",
  title: "AI processing",
  description: "Complete only if the processing involves AI.",
  subsections: [
    {
      id: "F1",
      stage: "F",
      title: "Does the processing involve AI?",
      summary: "AI processing questions apply only if the answer is Yes.",
      items: [
        yesno("F.applies", "Does the processing involve AI?", {
          help: {
            inline: "If No, the AI subsections are not applicable. If you are not sure, they stay open as unresolved.",
          },
        }),
      ],
    },
    {
      id: "F2",
      stage: "F",
      title: "AI system description",
      summary: "Type, purpose, role, inputs and outputs.",
      activeWhen: AI_ACTIVE,
      covers: ["F.role.example", "F.io.example"],
      items: [
        longtext("F.type", "AI type", {
          sourceText: "What type of AI or AI-based system is used? For example, a predictive model, a large language model (LLM), a generative AI tool or a scoring model.",
          help: { essential: true, inline: "What type of AI or AI-based system is used?" },
        }),
        longtext("F.purpose", "Purpose", {
          sourceText: "What does the AI system do, and why is it used instead of, or alongside, a non-AI approach?",
          help: { essential: true, inline: "What does the AI system do, and why is it used instead of, or alongside, a non-AI approach?" },
        }),
        longtext("F.role", "Role in the process", {
          sourceText:
            "Explain how the AI system is used in the process. Does it provide recommendations to a human, or does it make decisions without human intervention?",
          help: {
            essential: true, inline: "Does it provide recommendations to a human, or make decisions without human intervention?",
            example: "Illustration only: a scoring model suggests a decision; a human officer makes the final call.",
          },
        }),
        longtext("F.io", "Data inputs", {
          sourceText: "What personal data does the AI system use as input, and what information or results does it produce as output?",
          help: { essential: true, inline: "What personal data does the AI system use as input?", example: "Illustration only: input: transaction history, income data." },
        }),
        longtext("F.io.outputs", "Data outputs", {
          added: true,
          help: { essential: true, inline: "What information or results does it produce as output?", example: "Illustration only: output: a risk score." },
        }),
      ],
    },
    {
      id: "F3",
      stage: "F",
      title: "Profiling, automated decisions and human oversight",
      summary: "Whether the AI profiles people or makes significant decisions, and who oversees it.",
      activeWhen: AI_ACTIVE,
      items: [
        yesno(
          "F.profiling",
          "Profiling or automated decision-making: does the AI system profile individuals or make decisions that have legal or similarly significant effects on them?",
          { help: { inline: "Select Yes or No and explain your answer below." } },
        ),
        longtext("F.profiling.explanation", "Explain your answer", { added: true }),
        choice(
          "F.oversight",
          "Human oversight — select the option that best describes the process",
          [
            opt("HITL", "Human-in-the-loop – human approves before decision is finalised", "F.oversight.hitl"),
            opt("HOTL", "Human-on-the-loop (or Human Review) – human can review and override after the AI decides", "F.oversight.hotl"),
            opt("FULL", "Fully automated – no human intervention", "F.oversight.full"),
          ],
          { added: true },
        ),
        longtext("F.oversight.explain", "Explain how a human is involved in reviewing or approving the AI system’s outputs or decisions"),
      ],
    },
    {
      id: "F4",
      stage: "F",
      title: "Classification and fairness",
      summary: "Your declared EU AI Act category and bias testing.",
      activeWhen: AI_ACTIVE,
      covers: ["F.bias.example"],
      help: {
        explain:
          "The classification below is your own declaration. This application does not determine the EU AI Act classification and does not treat it as the same thing as DPIA risk.",
      },
      items: [
        choice(
          "F.class",
          "EU AI Act risk classification (declared by you) — what category does this system fall under?",
          [
            opt("UNACCEPTABLE", "Unacceptable risk (prohibited)", "F.class.unacceptable"),
            opt("HIGH", "High risk (requires conformity assessment)", "F.class.high"),
            opt("LIMITED", "Limited risk (transparency obligations apply)", "F.class.limited"),
            opt("MINIMAL", "Minimal risk", "F.class.minimal"),
            opt("UNSURE", "Not yet assessed / unsure"),
          ],
          { added: false },
        ),
        longtext("F.class.rationale", "Basis for your declared classification (optional)", { optional: true, added: true }),
        longtext("F.bias", "Bias and fairness: what is tested for bias and unfair outcomes?", {
          sourceText:
            "Explain how the AI system is tested for bias and unfair outcomes. Describe what is tested, how often testing takes place, and what measures are taken to address any issues identified.",
          help: {
            example: "Illustration only: bias testing performed on the training dataset; fairness metrics monitored in production; model audit conducted by a third party.",
          },
        }),
        longtext("F.bias.frequency", "How often does testing take place?", { added: true }),
        longtext("F.bias.remediation", "What measures are taken to address any issues identified?", { added: true }),
      ],
    },
  ],
};

export const STAGE_G: StageDef = {
  id: "G",
  title: "Policies and requirements",
  description: "Compliance with internal policies and external requirements.",
  subsections: [
    {
      id: "G1",
      stage: "G",
      title: "Internal policies",
      summary: "Does the processing comply with relevant internal policies?",
      covers: ["G.internal.example"],
      help: {
        example: "Illustration only: privacy policy, cookie policy, IT policy, information security policy, data retention policy.",
      },
      items: [
        choice(
          "G.internal.status",
          "Does the processing comply with the relevant internal policies and requirements?",
          [opt("YES", "Yes"), opt("PARTIAL", "Partially"), opt("NO", "No")],
          { help: { essential: true, inline: "If Yes, refer to the policy. If Partially or No, explain what is missing and what actions are planned." } },
        ),
        link("G.internal.policyRef", "Policy reference", {
          optional: false,
          activeWhen: { f: "G.internal.status", eq: "YES" },
        }),
        longtext("G.internal.gaps", "What is missing?", {
          activeWhen: { f: "G.internal.status", ne: "YES" },
        }),
        longtext("G.internal.actions", "What actions are planned?", {
          added: true,
          activeWhen: { f: "G.internal.status", ne: "YES" },
        }),
      ],
    },
    {
      id: "G2",
      stage: "G",
      title: "External requirements",
      summary: "External regulations, industry standards or codes of conduct.",
      covers: ["G.external.example"],
      help: { example: "Illustration only: EBA guidelines, PCI-DSS, ISO 27001." },
      items: [
        yesno(
          "G.external.status",
          "Does the processing need to comply with any external regulations, industry standards or codes of conduct?",
        ),
        collection(
          "G.external.list",
          "Applicable requirements",
          "Requirement",
          [
            text("G.external.requirement", "Applicable requirement", { added: true }),
            longtext("G.external.how", "How is it addressed?", { added: true }),
          ],
          {
            titleField: "G.external.requirement",
            addLabel: "Add a requirement",
            min: 1,
            activeWhen: { f: "G.external.status", eq: "YES" },
          },
        ),
      ],
    },
  ],
};
