import {
  choice,
  collection,
  date,
  entity,
  flag,
  info,
  link,
  longtext,
  multi,
  opt,
  pending,
  quantity,
  text,
  yesno,
  field,
} from "./build";
import type { StageDef } from "./types";

const quantityHelp = {
  inline:
    "Give your best estimate. A range is fine. If you genuinely do not know, mark this “Not sure — I need help”.",
  explain:
    "Counts help the screening rules in this template. They are organisational template thresholds, not universal legal thresholds. All counts should refer to the same scope and time period.",
};

export const STAGE_A: StageDef = {
  id: "A",
  title: "General information",
  description: "What the processing is, who owns it and why you are assessing it.",
  subsections: [
    {
      id: "A1",
      stage: "A",
      title: "Processing",
      summary: "Name and a short description of the processing.",
      intro:
        "A DPIA helps assess whether the processing of personal data is necessary and proportionate, and identifies potential risks to individuals’ rights and freedoms.",
      answerControls: "none",
      covers: [
        "TPL.intro.purpose",
        "TPL.intro.scope",
        "TPL.intro.mandatory",
        "TPL.intro.when",
        "TPL.intro.timing",
        // Owner is not a questionnaire item: it is the assessment's owner relationship, shown in the
        // header and exported from it (report + JSON) under this inventory ID.
        "A.owner",
      ],
      help: {
        explain:
          "The assessment focuses exclusively on personal data. Information about legal entities and anonymised data falls outside its scope. Data about natural persons linked to a legal entity (for example board members, beneficial owners or contact persons) is personal data and is in scope. The pre-assessment (section 3) is completed first to indicate whether a full DPIA is needed. Start early, review throughout the project and finalise before personal data processing begins. For an existing activity, first check whether a DPIA already exists; if so, update it. These are template rules of this organisation, not a statement of the law.",
      },
      items: [
        // The generated identifier is kept and exported, but not shown in the questionnaire view.
        field("A.generatedId", "Assessment identifier", "computed", {
          computed: "displayId",
          workflow: "system",
          hidden: true,
        }),
        text("A.processingName", "Name of the processing", {
          help: {
            inline: "A short, recognisable name, for example the service or process name.",
          },
        }),
        longtext(
          "A.description",
          "General description - brief summary of what the processing involves",
          {
            help: {
              inline: "Two to five sentences are enough here. Detail comes later.",
              include:
                "What is being done with personal data, for whom, and roughly why. Avoid internal jargon so a reader outside the project can follow.",
              example:
                "Illustration only: “An online tool that lets existing customers upload documents for a loan review, which staff then check.”",
            },
          },
        ),
      ],
    },
    {
      id: "A2",
      stage: "A",
      title: "Reason for the assessment",
      summary: "Why a DPIA is being done and what has changed, if anything.",
      answerControls: "none",
      items: [
        multi(
          "A.reason",
          "Reason for the DPIA",
          [
            opt("new", "New processing", "A.reason.new"),
            opt("changed", "Changed processing", "A.reason.changed"),
            opt("mandated", "Mandated by law", "A.reason.mandated"),
            opt("other", "Other (e.g. regular review)", "A.reason.other"),
          ],
          { added: true },
        ),
        longtext("A.changeDescription", "If “Changed processing” — describe what has changed", {
          activeWhen: { f: "A.reason", includes: "changed" },
        }),
        longtext("A.reasonSpecify", "If “Mandated by law” or “Other” — please specify", {
          activeWhen: {
            any: [
              { f: "A.reason", includes: "mandated" },
              { f: "A.reason", includes: "other" },
            ],
          },
        }),
        link("A.previousRef", "Previous assessment reference", {
          help: {
            inline:
              "If this activity was assessed before (for example in a Word document), enter its reference or link.",
          },
        }),
      ],
    },
  ],
};

export const STAGE_B: StageDef = {
  id: "B",
  title: "Parties",
  description: "Controllers, joint controllers, processors and sub-processors.",
  subsections: [
    {
      id: "B1",
      stage: "B",
      title: "Controllers",
      summary: "Who decides why and how personal data is processed.",
      answerControls: "help",
      noAbout: true,
      covers: ["B.ctrl.guidance"],
      items: [
        field("B1.help", "Not sure – I need help", "flag", {
          added: true,
          optional: true,
          helpRequest: true,
        }),
        // Retired from the screen, still stored: joint controllers are added as further controller records.
        flag("B.ctrl.noJoint", "There are no joint controllers", {
          hidden: true,
          optional: true,
        }),
        collection(
          "B.ctrl",
          "Controllers",
          "Controller",
          [
            // Existing controller-type data is preserved but no longer shown or edited.
            choice(
              "B.ctrl.kind",
              "Type",
              [opt("CONTROLLER", "Controller"), opt("JOINT", "Joint controller")],
              { added: true, hidden: true, optional: true },
            ),
            entity("B.ctrl.name", "Select", "PARTY", { ui: "select", noSuggestions: true }),
            longtext("B.ctrl.role", "Roles and responsibilities"),
          ],
          {
            min: 1,
            compact: true,
            titleField: "B.ctrl.name",
            addLabel: "+ Add a new Controller",
            guidance:
              "A controller is an entity of the group that decides why and how personal data is processed. If two or more entities jointly decide, they are joint controllers: add a record for each and describe their respective responsibilities.",
          },
        ),
      ],
    },
    {
      id: "B2",
      stage: "B",
      title: "Processors and sub-processors",
      summary: "Who processes personal data on the controller’s behalf.",
      answerControls: "help",
      covers: ["B.proc.guidance", "B.proc.example", "B.rows.addAsNeeded"],
      help: {
        explain:
          "A processor processes personal data on behalf of a controller. This may include external service providers and other group entities acting as processors. A sub-processor is engaged by a processor.",
        example:
          "Illustration only: a group insurer (controller) uses a group bank (processor) to run payroll services. The bank in turn uses an external hosting provider, which makes the provider a sub-processor.",
      },
      items: [
        field("B2.help", "Not sure – I need help", "flag", {
          added: true,
          optional: true,
          helpRequest: true,
        }),
        flag("B.proc.none", "No processors are involved", {
          completeWhen: { hasRecords: "B.proc" },
        }),
        collection(
          "B.proc",
          "Processors",
          "Processor",
          [
            entity("B.proc.name", "Processor name", "PARTY", { noSuggestions: true }),
            longtext("B.proc.role", "Roles and responsibilities"),
            link("B.proc.dpaRef", "Data processing agreement (DPA) reference", {
              help: { inline: "Optional text or link to where the agreement is kept." },
            }),
            collection(
              "B.sub",
              "Sub-processors",
              "Sub-processor",
              [
                entity("B.sub.name", "Sub-processor name", "PARTY", { noSuggestions: true }),
                longtext("B.sub.role", "Roles and responsibilities"),
                link("B.sub.dpaRef", "Data processing agreement (DPA) reference"),
              ],
              { compact: true, titleField: "B.sub.name", addLabel: "+ Add sub-processor" },
            ),
          ],
          {
            compact: true,
            collapsible: true,
            titleField: "B.proc.name",
            addLabel: "+ Add processor",
            activeWhen: { not: { f: "B.proc.none", eq: true } },
          },
        ),
      ],
    },
  ],
};

const SCREEN_NOTE =
  "These are the template’s screening questions. They produce an indication for the DPO to review; they are not a legal conclusion.";

export const STAGE_C: StageDef = {
  id: "C",
  title: "Pre-assessment",
  description: "Screening questions that indicate whether a full DPIA and a transfer assessment are needed.",
  subsections: [
    {
      id: "C0",
      stage: "C",
      title: "Screening inputs",
      summary: "Simple facts about how many people are involved.",
      intro:
        "Start here: enter simple counts. Later versions of this application will use them to suggest answers to the screening questions, which you always confirm yourself.",
      items: [
        longtext(
          "C.inputs.scope",
          "Scope and time period these counts refer to",
          {
            added: true,
            help: {
              inline: "For example “customers of the retail loan product in the last 12 months”. All counts below should use this same scope.",
            },
          },
        ),
        quantity(
          "C.inputs.population",
          "Approximately how many individuals does the processing involve in total?",
          { help: quantityHelp },
        ),
        quantity(
          "C.inputs.specialCount",
          "Approximately how many individuals have special category or criminal conviction/offence data processed? (Count each person once.)",
          { help: quantityHelp, optional: true },
        ),
        pending(
          "C.inputs.pending",
          "Suggested screening answers",
          "Suggested answers derived from these counts are not available yet; they arrive in Stage 3. Until then, answer each screening question yourself and give your rationale.",
          3,
        ),
      ],
    },
    {
      id: "C1",
      stage: "C",
      title: "Screening question 1 – special category and criminal data",
      summary: "Special category data or criminal conviction/offence data for 5000 or more individuals.",
      covers: ["C.q1.sc.list"],
      help: {
        explain:
          "Special category data includes health, biometric, genetic, racial/ethnic origin, political opinions, religious beliefs, trade union membership, sex life or sexual orientation. This question also covers criminal convictions and offence data. The 5000 threshold is a rule of this template, not a legal threshold.",
        include: "Which kinds of data, roughly how many individuals, and how you counted.",
      },
      items: [
        yesno(
          "C.q1",
          "Will the processing involve special category data or criminal convictions and offence data relating to 5000 or more individuals? (special category data includes health, biometric, genetic, racial/ethnic origin, political opinions, religious beliefs, trade union membership, sex life or sexual orientation)",
          { help: { inline: SCREEN_NOTE } },
        ),
        longtext("C.q1.rationale", "Rationale"),
      ],
    },
    {
      id: "C2",
      stage: "C",
      title: "Screening question 2 – evaluation, scoring and profiling",
      summary: "Systematic and extensive evaluation or scoring with significant effects.",
      covers: ["C.q2.example"],
      help: {
        explain:
          "The question has several parts that must all apply: the evaluation is systematic and extensive, it is based on automated processing, and the result has legal consequences or a similarly significant impact on individuals. The three helper questions below let you answer each part; the original question stays the one you confirm.",
        example:
          "Illustration only: automated credit scoring, HR ranking algorithms, automated assessment of insurance risk, fraud risk profiling.",
      },
      items: [
        yesno(
          "C.q2",
          "Will you conduct systematic and extensive evaluations or scoring, including profiling of individuals which are based on automated processing, where this evaluation or prediction results in legal consequences or has a similarly significant impact on them? (e.g., automated credit scoring, HR ranking algorithms, automated assessment of insurance risk, fraud risk profiling)",
        ),
        yesno("C.q2.systematic", "Part 1: Is the evaluation or scoring systematic and extensive?", {
          added: true,
          optional: true,
        }),
        yesno("C.q2.automated", "Part 2: Is it based on automated processing?", {
          added: true,
          optional: true,
        }),
        yesno(
          "C.q2.significant",
          "Part 3: Does the result have legal consequences or a similarly significant impact on individuals?",
          { added: true, optional: true },
        ),
        longtext("C.q2.rationale", "Rationale"),
      ],
    },
    {
      id: "C3",
      stage: "C",
      title: "Screening question 3 – new technologies",
      summary: "New technologies, or existing technologies applied in a new way.",
      covers: ["C.q3.example"],
      help: {
        example:
          "Illustration only: deploying machine learning to assess creditworthiness or insurance risk in place of or alongside traditional scoring methods; using generative AI to process personal data in ways not previously assessed; applying facial recognition in a new context.",
      },
      items: [
        yesno(
          "C.q3",
          "Will the processing involve new technologies or apply existing technologies in a new way? (e.g., deploying machine learning to assess creditworthiness or insurance risk in place of or alongside traditional scoring methods, using generative AI to process personal data in ways not previously assessed, applying facial recognition in a new context)",
        ),
        longtext("C.q3.rationale", "Rationale"),
      ],
    },
    {
      id: "C4",
      stage: "C",
      title: "Screening question 4 – monitoring of public areas",
      summary: "Systematic and large-scale monitoring of a publicly accessible area.",
      covers: ["C.q4.example"],
      help: {
        explain: "Both parts must apply: the monitoring is systematic and it is large-scale.",
        example: "Illustration only: CCTV networks covering public streets.",
      },
      items: [
        yesno(
          "C.q4",
          "Will the processing involve systematic and large-scale monitoring of a publicly accessible area? (e.g., CCTV networks covering public streets)",
        ),
        yesno("C.q4.systematic", "Part 1: Is the monitoring systematic?", {
          added: true,
          optional: true,
        }),
        yesno("C.q4.largeScale", "Part 2: Is it large-scale?", { added: true, optional: true }),
        longtext("C.q4.rationale", "Rationale"),
      ],
    },
    {
      id: "C5",
      stage: "C",
      title: "Screening question 5 – 10 000 or more individuals and specific risks",
      summary: "Sub-questions 5.1 to 5.6, each combining a risk and a count of individuals.",
      covers: [
        "C.q5.s1.example",
        "C.q5.s2.example",
        "C.q5.s3.example",
        "C.q5.s4.example",
        "C.q5.s5.example",
        "C.q5.s6.example",
      ],
      help: {
        explain:
          "In this template, question 5 applies when the processing involves the personal data of 10 000 or more individuals and potentially creates one or more of the listed risks. In this application each sub-question 5.1 to 5.6 is checked separately: the specific risk must apply AND it must apply to 10 000 or more individuals. Counts are not added across sub-questions. The examples are illustrations, not complete definitions. Count the individuals to whom the actual risk applies.",
      },
      items: [
        yesno(
          "C.q5",
          "Q5. Will the processing involve the personal data of 10 000 or more individuals and potentially create one or more of the following risks?",
          { help: { inline: "Your confirmed answer for question 5 as a whole. Suggested answers from the sub-questions arrive in Stage 3." } },
        ),
        longtext("C.q5.rationale", "Rationale for question 5"),
        info("C.q5.h1", "text", { title: "5.1 – Financial data", added: true }),
        yesno("C.q5.s1", "5.1 Processing may lead to exposure to financial data", {
          help: {
            example:
              "Illustration only: account statements, tax records, pension data, assets and liabilities, loan or credit applications, debt collection records.",
          },
        }),
        quantity("C.q5.s1.count", "Approximately how many individuals does this apply to?", {
          added: true,
          help: quantityHelp,
          activeWhen: { not: { f: "C.q5.s1", eq: "NO" } },
        }),
        longtext("C.q5.s1.rationale", "Rationale"),
        info("C.q5.h2", "text", { title: "5.2 – Identity theft or fraud", added: true }),
        yesno("C.q5.s2", "5.2 Processing could enable identity theft or fraud if compromised", {
          help: {
            explain:
              "The question is whether a compromise of the data could enable identity theft or fraud, not merely whether identity data exists.",
            example:
              "Illustration only: username and password combinations, national identification number, passport or ID card data, authentication credentials.",
          },
        }),
        quantity("C.q5.s2.count", "Approximately how many individuals does this apply to?", {
          added: true,
          help: quantityHelp,
          activeWhen: { not: { f: "C.q5.s2", eq: "NO" } },
        }),
        longtext("C.q5.s2.rationale", "Rationale"),
        info("C.q5.h3", "text", { title: "5.3 – Risk to property", added: true }),
        yesno(
          "C.q5.s3",
          "5.3 Processing could create a risk to a data subject’s property, particularly through financial services",
          {
            help: {
              explain: "Financial services are the template’s main context, not the only one.",
              example:
                "Illustration only: data enabling unauthorised access to financial accounts or credit cards.",
            },
          },
        ),
        quantity("C.q5.s3.count", "Approximately how many individuals does this apply to?", {
          added: true,
          help: quantityHelp,
          activeWhen: { not: { f: "C.q5.s3", eq: "NO" } },
        }),
        longtext("C.q5.s3.rationale", "Rationale"),
        info("C.q5.h4", "text", { title: "5.4 – Discriminatory outcomes", added: true }),
        yesno("C.q5.s4", "5.4 Processing may lead to discriminatory outcomes", {
          help: {
            explain:
              "Segmenting people or restricting access to services are examples, not requirements. Consider any way the processing could lead to discriminatory outcomes.",
            example:
              "Illustration only: segmenting individuals based on certain characteristics to assess or predict their potential interests, economic situation, job performance, reliability, behavioural tendencies or browsing patterns to restrict access to services.",
          },
        }),
        quantity("C.q5.s4.count", "Approximately how many individuals does this apply to?", {
          added: true,
          help: quantityHelp,
          activeWhen: { not: { f: "C.q5.s4", eq: "NO" } },
        }),
        longtext("C.q5.s4.rationale", "Rationale"),
        info("C.q5.h5", "text", { title: "5.5 – Vulnerable data subjects", added: true }),
        yesno("C.q5.s5", "5.5 Processing involves personal data of vulnerable data subjects", {
          help: { example: "Illustration only: service provision for children and elderly individuals." },
        }),
        quantity(
          "C.q5.s5.count",
          "Approximately how many vulnerable data subjects are involved?",
          {
            added: true,
            help: quantityHelp,
            activeWhen: { not: { f: "C.q5.s5", eq: "NO" } },
          },
        ),
        longtext("C.q5.s5.rationale", "Rationale"),
        info("C.q5.h6", "text", { title: "5.6 – Real-time tracking", added: true }),
        yesno(
          "C.q5.s6",
          "5.6 Processing involves real-time tracking of individuals’ location or movement through networks or tracking technologies",
          {
            help: {
              explain:
                "Check this against its own wording. The scope of the computer-activity-monitoring example is flagged for the template owner (CD-07).",
              example:
                "Illustration only: real-time location data via mobile or telecom services, computer activity monitoring software.",
            },
          },
        ),
        quantity("C.q5.s6.count", "Approximately how many individuals are tracked?", {
          added: true,
          help: quantityHelp,
          activeWhen: { not: { f: "C.q5.s6", eq: "NO" } },
        }),
        longtext("C.q5.s6.rationale", "Rationale"),
      ],
    },
    {
      id: "C6",
      stage: "C",
      title: "Screening question 6 – 50 000 or more individuals",
      summary: "Other personal data relating to 50 000 or more individuals.",
      help: {
        explain:
          "The template asks about other personal data “not already covered by questions above”. It is not clear whether that means different individuals or different data, so if you answered Yes to any of questions 1 to 5 please explain your reasoning; the DPO will review it.",
      },
      items: [
        yesno(
          "C.q6",
          "6. Will the processing involve any other personal data relating to 50 000 or more individuals not already covered by questions above?",
        ),
        longtext("C.q6.rationale", "Rationale"),
      ],
    },
    {
      id: "C7",
      stage: "C",
      title: "Screening question 7 – outside the EU/EEA",
      summary: "Data shared with or accessible by a third party outside the EU/EEA.",
      covers: ["C.q7.scopeNote", "C.q7.tiaNote"],
      help: {
        explain:
          "This includes onward transfer to sub-processors, cloud providers, support teams or group companies located outside the EU/EEA. A Yes here triggers a Transfer Impact Assessment (TIA), which is separate from and additional to any DPIA obligation. A Yes to this question alone does not indicate a full DPIA.",
      },
      items: [
        yesno(
          "C.q7",
          "7. Will the data be shared with or accessible by a third party outside of the EU/EEA? (This includes onward transfer to sub-processors, cloud providers, support teams, or group companies located outside the EU/EEA. A Yes here triggers a Transfer Impact Assessment (TIA), which is separate from and additional to any DPIA obligation)",
        ),
        longtext("C.q7.rationale", "Rationale"),
      ],
    },
    {
      id: "C8",
      stage: "C",
      title: "Screening outcome",
      summary: "What the screening answers indicate.",
      covers: ["C.out.noYes", "C.out.fullDpia", "C.out.tia", "C.out.unresolved"],
      items: [info("C.out.block", "screeningOutcomes", { added: true })],
    },
    {
      id: "C9",
      stage: "C",
      title: "DPO screening decision",
      summary: "Recorded by the assigned DPO.",
      covers: ["C.dpo.mayRequire"],
      help: {
        explain:
          "The DPO may require a full DPIA regardless of the screening outcome, for example where significant risks are identified or where a code of conduct or national law mandates it.",
      },
      items: [
        longtext("C.exception.rationale", "Rationale and mitigation controls (if full DPIA is deemed unnecessary despite ‘Yes’ answers)", {
          workflow: "dpo-screening",
          workflowNote: "Recorded by the assigned DPO. This workflow arrives in Stage 4.",
        }),
        longtext("C.dpo.advice", "DPO advice or recommendations", {
          workflow: "dpo-screening",
          workflowNote: "Recorded by the assigned DPO. This workflow arrives in Stage 4.",
        }),
        choice(
          "C.dec",
          "Decision (DPO to complete)",
          [
            opt("PROCEED", "Proceed to full assessment of the DPIA", "C.dec.proceed"),
            opt("SUFFICIENT", "Pre-assessment sufficient — no full DPIA required", "C.dec.sufficient"),
          ],
          {
            added: true,
            workflow: "dpo-screening",
            workflowNote: "Recorded by the assigned DPO. This workflow arrives in Stage 4.",
          },
        ),
        text("C.dec.dpoName", "DPO name", {
          workflow: "dpo-screening",
          workflowNote: "Filled from the assigned DPO when the decision is recorded (Stage 4).",
        }),
        date("C.dec.date", "Date", {
          workflow: "dpo-screening",
          workflowNote: "Filled when the decision is recorded (Stage 4).",
        }),
      ],
    },
  ],
};

export const STAGE_D: StageDef = {
  id: "D",
  title: "Full assessment – rationale and scope",
  description: "What this DPIA covers and when processing is expected to start.",
  subsections: [
    {
      id: "D1",
      stage: "D",
      title: "Scope of this DPIA",
      summary: "What is included and what is covered elsewhere.",
      intro:
        "Until the screening logic arrives in Stage 3, all full-assessment sections are open for completion. Full-assessment sections will become active or inactive according to the screening decision.",
      items: [
        longtext("D.scope.included", "What is included in this assessment?"),
        link(
          "D.scope.otherDpia",
          "If any part of the processing is covered by a separate DPIA, reference it here",
        ),
        longtext(
          "D.scope.excluded",
          "Explain what has been excluded and why (if any part is covered by a separate DPIA)",
          {
            optional: true,
            sourceText:
              "If any part of the processing is covered by a separate DPIA, reference it here and explain what has been excluded and why.",
          },
        ),
      ],
    },
    {
      id: "D2",
      stage: "D",
      title: "Estimated launch date",
      summary: "When the processing is expected to start.",
      items: [date("D.launchDate", "Estimated launch date of the processing")],
    },
  ],
};
