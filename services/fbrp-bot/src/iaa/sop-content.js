/**
 * The IAA Standard Operating Procedures, as lightweight markup:
 *   "# " heading 1, "## " heading 2, "- " bullet, "1. " numbered step, anything else a paragraph.
 * {{strikeDays}} and {{inactivityDays}} are filled from the live bot settings.
 * Every slash command mentioned here is checked against the real command list by the tests.
 */
export const SOP_TEXT = String.raw`
FBRP

Internal Affairs Agency | SOP

CONTROLLED IAA DOCUMENT | VIEW ONLY FOR APPROVED IAA ACCOUNTS

Effective date: November 12, 2026

Document owner: cajunz

Access authority: Approved IAA document access list

This document is the primary operating reference for every Internal Affairs Agency member. It explains how the agency is expected to function in game, how agents are expected to conduct themselves, how staff responsibilities must be separated from agency work, and how official records are created and maintained. When a verbal instruction conflicts with this document, follow the most recent written direction from High Command and request clarification as soon as practical.

# 1. Mission and Role of the IAA

The IAA is the server's internal affairs, internal security, and investigative agency. Its purpose is to collect reliable information, identify threats to the community and agency, conduct fair investigations, support lawful roleplay operations, and give command staff accurate findings for decisions. The IAA is not a personal enforcement tool, a shortcut around normal roleplay, or a reason to interfere in another department's work.

An agent's job is to observe, verify, document, analyze, and report. Force, detention, searches, seizures, and direct enforcement actions must follow the server rules, the current in-game law or department policy, and the direction of authorized command. Intelligence work should create roleplay, not end it without a fair opportunity for participation.

- Develop accurate intelligence.
- Investigate dual clanning, blacklisted server involvement, transfers, internal misconduct, and other assigned matters.
- Support other departments when IAA involvement is requested or clearly authorized.
- Maintain complete, factual, and confidential records.
- Treat every subject fairly and avoid conclusions before the evidence is reviewed.

# 2. Authority and Chain of Command

IAA authority comes from the server, the rank structure, assigned divisions, and the bot's current permission configuration. Rank never permits an agent to ignore server rules or staff policy. The bot enforces minimum command tiers and prevents most users from acting on members at or above their own rank. If the bot denies an action, do not bypass it through manual role edits. Contact someone with the required authority.

## 2.1 Command tiers

- Agents carry out assigned operations, maintain readiness, use self-service commands, and report through their supervisors.
- Supervisors manage routine roster actions, orientation, warnings and strikes, investigations, and leave decisions unless command changes a permission.
- Low Command may remove members, issue or revoke suspensions, manage the blacklisted server list, issue routine commendations, grant access to the roster and this SOP, and record alt-account links.
- Trial High Command performs the duties permitted by the current bot configuration and works under High Command oversight.
- High Command controls agency blacklists, medals, Agent of the Month, access to the locked alt database, alt-account scans, and bot administration.
- Investigation Division members may open and work investigations even when their rank tier would not normally permit it. Case closure still requires the configured closing authority.

## 2.2 Acting on another member

Except for a system administrator, an agent may only take personnel or disciplinary action against someone who is strictly below their own rank. Members may not approve their own leave, decorate themselves, investigate themselves, alter their own personnel status through command functions, or work a case in which they are the subject.

## 2.3 Orders and disagreements

Follow lawful and reasonable orders from the chain of command. If an order appears to conflict with server policy, preserve evidence of the instruction, ask for clarification, and elevate it to the next level. Do not argue in public channels or disrupt an active scene. An obviously abusive or rule-breaking instruction does not need to be followed.

# 3. Membership, Orientation, and Readiness

## 3.1 Appointment

New members are appointed to a starting rank through the roster system. The bot assigns agency roles, records the appointment, calculates a callsign, updates the roster, and normally applies the Needs Orientation status. A member on the roster is responsible for confirming that their rank, callsign, nickname, and division assignments are correct.

## 3.2 Orientation

Agents marked Needs Orientation are not cleared to independently work cases or represent themselves as fully qualified. Orientation should cover this handbook, confidentiality, chain of command, radio and Discord standards, evidence handling, investigation procedures, staff separation, and the correct use of agency systems. A supervisor records the result with /iaa orientation. A failed orientation is a training result, not an invitation to embarrass the member.

## 3.3 Callsigns

Callsigns take the form IA-## and are assigned from fixed rank ranges. They may change after appointments, promotions, demotions, removals, or a manual roster correction. Use the current callsign shown by the bot and the IAA Roster. Do not claim, trade, or reserve a number. Agents should update their in-game identity and communications promptly when their callsign changes.

## 3.4 Divisions and positions

Division, subdivision, and coordinator roles are assignments, not separate authority to exceed the member's rank. Members may be assigned with /iaa assign. A division assignment should be based on operational need, training, and activity.

# 4. General Standards for IAA Agents

- Remain professional in game, in Discord, in direct messages connected to IAA work, and while representing the server.
- Use clear, calm communication. Do not bait, threaten, harass, or humiliate subjects or other agents.
- Do not fabricate intelligence, alter evidence, make false entries, or leave out important facts to create a preferred result.
- Do not use agency access for personal disputes, retaliation, favoritism, or advantage on another character.
- Keep roleplay information separate from out-of-character knowledge. Information learned through staff tools, spectating, logs, or private staff channels is not automatically in-character intelligence.
- Do not disclose private cases, roster data, alternate account information, staff information, or controlled documents to unauthorized people.
- Use the least intrusive method that can reasonably accomplish the assignment.
- Report mistakes promptly. Correcting a record early is better than hiding an error.
- Maintain an active and reachable Discord account. Read announcements, case pings, and direct messages from command.
- Follow all server rules even when this document does not repeat them.

# 5. In-Game Conduct and Operations

## 5.1 Before going on duty

1. Confirm your current rank, callsign, division, and duty status.
2. Check agency announcements, active operations, open case assignments, and blacklisted server notices.
3. Make sure your recording and screenshot tools work before beginning sensitive activity.
4. Use the correct character, uniform, equipment, vehicle, radio channel, and identification required by current server policy.
5. Advise a supervisor if you are not trained, have a conflict of interest, or cannot complete the assignment.

## 5.2 During an operation

Operate within the assigned objective. Keep radio traffic brief and useful. Record material observations with times, locations, names, vehicles, statements, and supporting media. Clearly separate what you personally observed from what another person reported. Do not turn speculation into fact.

When working with another department, identify the IAA lead and the other department's lead. Agree on the objective, who has scene control, what information can be shared, and who will make any arrest or enforcement decision. IAA rank does not automatically place an agent in command of a police, fire, medical, military, or staff scene.

## 5.3 Surveillance and intelligence collection

- Use lawful roleplay methods and respect server restrictions on tracking, recording, disguises, private property, and communications.
- Avoid unnecessary contact with the subject. Do not reveal an investigation merely to provoke a reaction.
- Preserve full context. A short clip or screenshot should be supported by the events before and after it when those events matter.
- Confirm identities through more than one reasonable indicator when account names, character names, or disguises may be confused.
- End or change a method when it creates an unreasonable rule risk or no longer serves the assigned objective.
- Report urgent threats immediately instead of waiting to write a perfect report.

## 5.4 Use of force and enforcement

IAA status does not create unlimited enforcement power. Agents may only use force or carry out detention, search, arrest, seizure, or similar action when current server policy and the roleplay situation authorize it. When another department has clear jurisdiction, transfer the enforcement portion to that department unless immediate action is necessary to protect life or prevent a serious ongoing threat.

## 5.5 After an operation

1. Secure recordings, screenshots, links, and notes before leaving the session.
2. Report urgent outcomes to the operation lead.
3. Add evidence and notes to the correct case, or submit the information to a supervisor for review.
4. Document any force, staff intervention, rule concern, lost evidence, or procedural mistake.
5. Do not discuss the operation outside authorized channels.

# 6. Intelligence Standards

IAA reporting must be reliable enough for another authorized agent to understand what happened without guessing. Every material statement should be labeled by its source and confidence.

- Confirmed: directly observed, supported by reliable records, or independently verified.
- Corroborated: supported by more than one source or item of evidence.
- Reported: provided by a source but not yet independently verified.
- Assessment: an analytical conclusion based on identified facts.
- Unknown: important information that has not been established.

Agents should consider source reliability, motive, opportunity to observe, consistency, and whether the information can be independently checked. Anonymous tips can start a review, but serious findings should not rest on an unverified accusation alone.

# 7. Opening and Managing Investigations

## 7.1 When to open a case

Use /investigation open when there is a specific allegation or security concern that requires structured review. Available case types include Dual Clanning, Blacklisted Server, Transfer, and Other. Do not open duplicate cases for the same subject and issue. Do not open a case as a joke, threat, or placeholder without an allegation.

## 7.2 Opening procedure

1. Confirm that you have investigation access and no personal conflict with the subject.
2. Search existing cases and the blacklisted server list.
3. Choose the correct subject, case type, and priority.
4. Write a neutral summary describing what allegedly happened, when it occurred, and why it matters.
5. Attach the initial file or link when available.
6. Decide whether the Under Investigation role is necessary. The default is to apply it when the subject is in the server.
7. Only notify the subject when notice will not create an evidence, safety, or integrity risk. The default is no notice.
8. Claim the lead or assign an authorized lead, then add only necessary collaborators to the private thread.

Cases receive a reference in the format IA-year-number and a private case thread. The pinned case file is the authoritative summary. Case access is confidential. Do not add spectators, friends, or unrelated command members.

## 7.3 Priorities

- Critical: an immediate threat to server safety, agency integrity, or a major ongoing incident requiring prompt command attention.
- High: serious conduct or a time-sensitive matter with significant potential harm.
- Normal: the standard priority for routine investigations.
- Low: limited impact, historical review, or a matter that can wait without meaningful risk.

## 7.4 Case statuses

- Open: created and not yet assigned.
- Active: a lead is assigned and investigative work is underway.
- Pending command review: the evidence and proposed findings are ready for command review.
- On hold: work is paused for a documented reason such as unavailable evidence or an external dependency.
- Closed: a verdict and disposition have been entered and the file is sealed.

## 7.5 Lead investigator duties

- Set an investigation plan and keep the scope connected to the allegation.
- Direct collaborators and prevent duplicate or conflicting work.
- Maintain the case thread, evidence log, notes, status, priority, and subject protections.
- Contact the subject or witnesses fairly when interviews are appropriate.
- Identify both inculpatory and exculpatory evidence.
- Move the case to command review when the record is ready.
- Respond to stale-case reminders and document any reason for delay.

# 8. Evidence and Notes

## 8.1 Evidence requirements

Evidence must be authentic, relevant, and understandable. Use /investigation evidence to log what the item is, what it shows, who submitted it, and a working file or link. Attachments must fit the bot's size limits. Preserve the original media when possible.

- Do not crop, edit, rename, or compress a file in a way that hides relevant context.
- Record the date, time, location, account or character identity, and collection method when known.
- Explain who created a screenshot or recording when it was supplied by someone else.
- Treat deleted, inaccessible, or unverifiable links as limited evidence and seek a stable copy.
- Never manufacture reenactments or staged evidence without clearly labeling them as demonstrations.
- If evidence contains sensitive staff or personal information, consult command before reposting it.

## 8.2 Investigator notes

Use /investigation note for analysis, interview summaries, tasking, unresolved questions, and procedural decisions. Notes must remain professional and factual. Avoid jokes, insults, unsupported accusations, or private information that is not relevant to the case.

## 8.3 Interviews

1. Identify yourself and the purpose of the interview unless command has approved a different approach.
2. Ask open and neutral questions before presenting conclusions.
3. Allow the person to explain, correct, and provide supporting evidence.
4. Do not promise an outcome you do not control.
5. Record the substance of the interview accurately and identify any material refusal or limitation.
6. Add the summary and supporting media to the case promptly.

# 9. Closing, Reopening, and Disposition

## 9.1 Verdicts

- Substantiated: the evidence establishes the allegation.
- Policy violation (other): the original allegation may not be fully established, but the evidence proves another policy violation.
- Unsubstantiated: the available evidence does not establish the allegation.
- Insufficient evidence: a reliable conclusion cannot be reached with the available record.
- Exonerated: the evidence affirmatively clears the subject.

A non-guilty verdict cannot carry punishment. Findings should identify the allegation, the material facts, how conflicting evidence was resolved, the verdict, and why the chosen outcome is proportionate.

## 9.2 Outcomes

Available outcomes are no action, warning, strike, suspension, removal, and removal plus IAA blacklist. The closing agent must have the permission required for the selected outcome and must outrank the subject when punishment is applied. Suspensions require a duration. The bot applies the outcome, removes the investigation flag when appropriate, creates a sealed report and transcript, and archives the case thread.

## 9.3 Reopening

A closed case should be reopened only for new material evidence, a significant procedural error, or a command-directed review. Use /investigation reopen and provide a specific reason. Disagreement with a lawful outcome by itself is not a reason to alter the record.

# 10. Discipline and Corrective Action

Discipline exists to protect standards, correct behavior, and document accountability. It must not be used for retaliation or public embarrassment. Before issuing discipline, confirm the facts, the member's identity and rank, the applicable rule, and your authority.

- Warning: a written corrective action kept on the member's record. Warnings do not create an active status role.
- Strike: a serious formal action that applies the First Strike role and expires after {{strikeDays}} days. More than one active strike should trigger suspension or removal review.
- Suspension: temporarily removes agency roles, applies the Suspended role, and restores saved roles automatically when the period ends.
- Revocation: ends an active strike or suspension and records who ended it and why.
- Removal: separates the member from the agency, clears agency roles and callsign, closes active discipline, revokes document access, and resequences the roster.
- IAA blacklist: removes and bans the user, records the reason, and blocks reentry until High Command lifts it.

Use /discipline record to review a member's disciplinary history when authorized. Do not discuss discipline outside the people who need it for supervision, review, or appeal.

# 11. Leave of Absence

## 11.1 Member procedure

1. Submit /loa request with the number of days, reason, and optional future start date.
2. Wait for approval before assuming the leave is active.
3. Use /loa end to withdraw a pending request or return early.
4. Do not perform ordinary IAA duties while on approved leave unless command asks for limited emergency assistance and the member agrees.

## 11.2 Supervisor procedure

Supervisors review the dates, reason, operational impact, and any conflicting request. They may not decide their own leave. Approval applies the LOA status at the start time, updates the roster, and removes the role automatically when the leave ends. Inactivity warnings stay active for {{inactivityDays}} days. Denials should include a useful reason when possible.

# 12. IAA Document Access and Confidentiality

IAA documents are controlled through named Google accounts, one approved account per active roster member. The IAA Roster, this SOP, and the locked alt database are private; they are never shared by link. Low Command or higher grants access with /iaa-docs access grant, naming the member and the Google account that will be used. Only High Command may grant access to the locked alt database, which is view-only and limited to Supervisors and above. Once granted, open a document with /iaa-docs open. Every grant records who approved it.

Access is automatically reconciled against the roster every few minutes and revoked as soon as a member is removed, retires, is blacklisted, leaves the server, or is no longer an active agent. A periodic audit also removes any sharing that was not granted through the bot.

- Do not provide a shared account or an account controlled by another person.
- Do not forward, download for redistribution, publish, mirror, or copy controlled documents into unauthorized locations.
- Do not use link sharing to bypass the access list.
- Report a compromised account immediately and ask High Command to revoke access.
- The IAA Systems service account and the document owner retain administrative access so the bot can maintain permissions. All ordinary IAA members receive read-only access.
- Access to a document does not authorize disclosure of every item in that document during roleplay.

# 13. Alternate Accounts

Members must disclose relevant Discord alternate accounts to Low Command or higher, who record the link and the evidence with /iaa-docs alt add and clear outdated records with /iaa-docs alt remove. Records are stored in the separate IAA Locked Alt Database. Only High Command grants access to that sensitive file, and only to current Supervisors and above. High Command may use /intel alt-scan and /intel lookup for legitimate security and identification work.

An alt record is intelligence, not a verdict. Do not punish anyone on an alt record alone.

Do not use an alternate account to evade discipline, conceal agency membership, enter a blacklisted community, access a case involving yourself, or gather information that the primary account could not lawfully obtain. Failure to disclose an account when required may be treated as an integrity concern.

# 14. Blacklisted Servers and Dual Clanning

The blacklisted server list is an intelligence and membership protection tool. Low Command or higher may add or remove entries with /intel blacklisted-server. Each entry should contain the correct server ID, name, a clear reason, and a valid invite link when appropriate. Listing a server is a command decision and should be supported by reliable information.

A member's presence in another community is not automatically proof of dual clanning. Investigators should confirm the account, the other community, the member's role or activity, applicable server policy, dates, and any permitted explanation. Blacklisting a person requires High Command authority and should follow a documented case unless an urgent security situation makes immediate action necessary.

# 15. Roster and Personnel Administration

## 15.1 Appointments, promotions, and demotions

Use the bot for all personnel movements so roles, callsigns, logs, nicknames, and the roster remain consistent. Provide an honest reason. A supervisor may only grant ranks below their own. Check that a fixed callsign slot is available before moving a member.

## 15.2 Removal and retirement

Low Command or higher may use /iaa remove. Select retirement only for an honorable separation that qualifies for the matching retired role. Removal strips agency roles, revokes document access, clears active discipline, updates the roster, and recalculates callsigns. Do not manually remove only part of a member's roles and leave the roster inconsistent.

## 15.3 Records

Use /iaa profile for a personnel summary and /iaa history for service history when authorized. The personnel file and the IAA Roster sheet are official records. Fields managed by the bot should not be manually overwritten. Report a discrepancy to command and use the proper bot action or /iaa-docs sync to correct it.

# 16. Awards and Recognition

Recognition should be based on documented service, leadership, integrity, or exceptional performance. Low Command may issue a Letter of Commendation. High Command controls medals and Agent of the Month. Members may not decorate themselves. Citations should identify the conduct being recognized and should be suitable for a permanent record.

# 17. Discord and Communication Standards

- Use the correct channel for operations, cases, personnel actions, discipline, leave, and logs.
- Keep case threads private and add collaborators only through the case process.
- Do not delete official messages or evidence to hide a mistake or outcome.
- Do not ping large groups unless action is required.
- Use direct messages for private notice, not for unlogged command decisions that should be in an official channel.
- Never share case thread screenshots, roster data, email addresses, alternate account data, or staff-only information with unauthorized users.
- If the bot is unavailable, record the information safely and have an authorized person enter it when service is restored.

# 18. Staff Duties and Separation from IAA Duties

Some IAA members also hold server staff positions. Staff authority and IAA authority are separate. Staff duties exist to enforce server rules and protect the community. IAA duties exist to create and manage intelligence roleplay and agency administration. Holding both roles does not permit a member to combine their powers for convenience.

## 18.1 Required separation

- Do not use IAA rank or case status to influence a staff punishment.
- Do not use staff authority to force a subject to cooperate with an in-character interview.
- Do not open an IAA case merely because a player filed a staff report. Determine whether there is a separate agency or roleplay issue.
- Do not use an IAA investigation to relitigate a completed staff decision.
- When a situation requires staff action, pause the IAA roleplay as cleanly as possible, identify that you are acting as staff, handle the staff issue under staff policy, and document any effect on the roleplay.
- If staff-only evidence is necessary for agency security, obtain management approval and record the limitation without exposing protected staff information.

## 18.2 Staff conduct while representing the IAA

IAA members performing staff duties must remain calm, explain decisions as required by staff policy, avoid threats based on agency status, and never access IAA systems to intimidate a player. Misuse of staff tools should be reported through staff channels. Misuse of IAA authority should be reported through the IAA chain of command. When both are involved, both reporting paths may be necessary.

# 19. Security Incidents and Emergency Actions

An urgent threat may require immediate protective action before a full case is opened. Examples include compromised agency accounts, leaked controlled documents, active evidence destruction, credible threats to server safety, or a blacklisted user attempting to regain access.

1. Protect people and systems from immediate harm within your actual authority.
2. Notify the highest available command member and server staff when the issue crosses into staff security.
3. Preserve logs, messages, recordings, account IDs, and timestamps.
4. Limit disclosure to people who need to respond.
5. Open or update the appropriate case and document any emergency action taken.
6. Review the action after the incident and correct any temporary access or role changes.

# 20. System and Bot Use

The bot is the official workflow for roster actions, callsigns, investigations, discipline, leave, awards, blacklists, alternate accounts, document access, and live panels. Commands are logged. Do not test destructive commands on real members, share admin access, or bypass a permission failure through manual changes.

## 20.1 Common member commands

- /iaa profile: view a personnel file. Your own profile is available by default.
- /iaa roster: view the live roster.
- /discipline record: view your own record. Viewing another member requires authority.
- /loa request and /loa end: manage your leave.
- /iaa-docs open: open a document you were granted access to.

## 20.2 Common command and investigator commands

- /iaa add, /iaa promote, /iaa demote, /iaa remove, /iaa assign, /iaa orientation, and /iaa callsigns: personnel administration.
- /investigation open, view, list, assign, add-agent, evidence, note, update, close, and reopen: case management.
- /discipline warn, strike, suspend, revoke, and record: discipline.
- /iaa blacklist add, remove, and list: individual IAA blacklist.
- /intel blacklisted-server add, remove, and list: server blacklist publication.
- /commend: awards and recognition.
- /iaa-docs access grant, revoke, and list, and /iaa-docs alt add, remove, and list: document access and alt records.
- /iaa-admin commands: High Command setup, permissions, panels, roles, channels, callsign slots, and imports. /iaa-docs link and /iaa-docs sync maintain the documents.

Command permissions can be adjusted by High Command. The bot's current response controls. If a command produces an error after part of a process appears to occur, do not repeat it blindly. Check the member, case, log, and roster state, then report the error.

# 21. Offboarding and Access Revocation

When a member leaves, is removed, retires, or is blacklisted, command must use the proper bot workflow. The system removes agency roles, clears the current callsign and rank, ends active discipline as appropriate, revokes document access, updates the roster, and adjusts callsigns. The access reconciler also removes the member's permission if they leave the server or lose their agency rank by any other route.

Departing members remain responsible for confidentiality. Copies of controlled documents and case materials must not be retained or redistributed. Any agency property, credentials, or access not handled automatically must be returned or revoked by command.

# 22. Reporting Concerns and Appeals

Agents should report suspected misconduct, security concerns, retaliation, conflicts of interest, and significant system errors to an uninvolved supervisor or High Command member. Reports should include facts, dates, people involved, and supporting evidence. Knowingly false reports may result in discipline.

A member may request review of a personnel or disciplinary decision through the chain of command. An appeal should explain the claimed factual or procedural error and provide new or overlooked information. Appeals do not authorize public arguments, harassment, evidence deletion, or refusal to follow an active restriction.

# 23. Document Control and Acknowledgment

High Command owns this SOP and may revise it when agency systems, server rules, or operational needs change. The current Google Doc is the controlling copy. Screenshots, exports, reposts, and old copies may be outdated. Material changes should be announced to the agency.

Every IAA member is expected to read this document, ask questions about unclear requirements, and follow the current version. Lack of familiarity does not excuse conduct that a reasonable agent should recognize as improper. Supervisors are responsible for teaching these standards and applying them consistently.

END OF CONTROLLED DOCUMENT
`;
