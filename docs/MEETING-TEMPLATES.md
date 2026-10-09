# Meeting templates

The library is an original Synqra implementation, not a copy of another product's templates or private meeting records. The existing Synqra design system remains authoritative.

## Workflow

New meeting → search/filter by division → select and preview → Use template → editable notes → Save meeting, or optionally Generate AI → review selected tasks → create.

The 18 choices cover blank/general notes, weekly sync, one-on-one, candidate interview, onboarding, standup, sprint planning, retrospective, kickoff, design review, user interview, sales discovery, marketing campaign, finance review, operations, leadership/OKRs, and incident review. Durations are suggested Synqra defaults, not prescriptions from the sources.

Template headings and `>` guidance lines are excluded from extraction. Enter actual discussions and actions on normal lines. Empty guidance alone cannot enable AI generation or produce draft action items. Changing template requires explicit confirmation before replacing existing notes; Back preserves them. Template IDs persist with meetings. Manual device drafts remain scoped to user and project.

## Research

- [Atlassian project kickoff](https://www.atlassian.com/team-playbook/plays/project-kickoff): align purpose, roles, and success criteria.
- [Atlassian retrospective](https://www.atlassian.com/team-playbook/plays/retrospective): reflect on team practices and agree improvements with follow-up.
- [OPM structured interviews](https://www.opm.gov/policy-data-oversight/assessment-and-selection/structured-interviews/): consistent job-related questions and assessment criteria. Synqra records evidence for a human debrief; it does not make hiring decisions.
- [Notion one-on-one notes](https://www.notion.com/templates/1-1-meeting-notes-for-managers): organize check-ins, discussion, and follow-up.

The remaining division agendas are authored for common office coordination needs. They are editable starting points, not legal, financial, or HR compliance policies.

## Sensitive notes

Use an invite-only project with appropriate members for HR/interview/finance notes. Project access—not the selected template—controls visibility. AI is optional and manually invoked; do not submit sensitive notes unless your organization permits processing by the configured AI provider. Guidance beginning with `>` is excluded from both AI and local task extraction.

## Project knowledge adaptation

Project Docs provides General, PRD, Retrospective, Meeting notes, and Runbook document types, optional project-local epic/sprint links, safe text/Markdown-subset preview, download, archive, and restore. Editors can write; viewers can read. Saves require a version and reject stale overwrites. Device drafts are user/project scoped. Reload/switch actions explicitly confirm discarding edits.

My Work now spans authorized projects with a project filter and project labels. Archived items are excluded and closed/rejected work is not counted overdue. Existing Portfolio & PMO reports, sprint planning, Board/Timeline, and task estimate hours are retained. Full space hierarchy, time logs, custom fields, and private reference data imports are not part of this change.

## Release order

Before production rollout, apply `migrations/0018_project_documents.sql` to the target D1 database, then deploy the Worker/API and frontend together. The frontend must not be published against an unmigrated API. This task requests commit/push, not production migration/deploy.
