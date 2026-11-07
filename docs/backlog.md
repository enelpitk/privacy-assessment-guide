# Backlog (not scheduled)

UI refinement is paused. These are ideas noted so far; none is being implemented.

- Visual check of the compact typography and spacing on desktop and phone (not yet seen in a browser).
- Reword the "Coming in Stage N" labels (they name development stages) once the later stages ship.
- Decide whether the "About this section" help should stay collapsed or return to an always-visible right-hand column.
- Apply the compact record layout and single help-request control to other repeatable sections if it works well in sections 2.1 and 2.2.
- Reordering records currently reloads the page; make it update in place.
- Suggestion list for the Q7 recipient-location hint is a short illustrative list; replace with a maintained EU/EEA lookup if the project continues.
- The Q5 sub-question table's Result column is clipped at about 1000px width with the navigation open (it scrolls sideways); tighten the table or let it wrap. Seen during Railway verification.
- Per-question "Comment" links add a line under every field; consider showing them on hover/focus or only where comments exist.
- Notifications for assignments, comments, changes requested, review completed and overdue items (Stage 5).
- Comparing two versions side by side; the snapshot viewer shows one snapshot at a time.
- Measure progress records are shown on Review and decisions; consider showing the latest progress inside the risk register too.
- The questionnaire's review-status blocks fetch governance data separately; they could share one request with the page.

## Behaviour backlog from the Stage 4 decision review (not implemented; each needs an explicit instruction)

- **Narrower correction of a recorded final owner decision (CD-34).** Today, correcting a recorded final owner decision, including on the pre-assessment-only path, requires "Start review / update" and a fresh screening. Candidate: a narrow owner action "Reopen the decision" (reason required) that records a new superseding owner decision against the same reviewed snapshot, without repeating screening or the DPO checkpoints, and not offered once the path has changed.
- **Earlier short opinion shown as current (CD-34).** After "Reopen screening", the earlier screening-cycle short opinion is not marked superseded or historical. It still counts as the latest opinion in the questionnaire's 11.1 status block and in the internal `latestOpinion` state until the new cycle records its own opinion. It cannot satisfy any gate (checked locally), so this is a display and clarity gap only. Candidate: mark opinions of an invalidated screening cycle as "Earlier screening cycle" and exclude them from "latest opinion".
- **Rejected assessments appear as "Finalised".** The register status and the version chip say "Finalised" for a rejected version. The decision itself reads "Rejected". Candidate: show "Finalised – rejected" in the register, history and header.
