# Triage Process and GitHub Labels for Wrangler

This document describes how the team uses labels to triage issues on GitHub.

Issue triage should occur daily so that issues can be prioritized against other work currently planned.

If an issue or PR obviously relates to a release regression, we must assign an appropriate priority (`P0` or `P1`) and ensure that someone from the team is actively working to resolve it.

## Triage Steps

Anyone can triage issues as they arrive in the repository.

New untriaged issues can be found by filtering the issues list for those [not in a project](https://github.com/cloudflare/wrangler2/issues?q=is%3Aopen+is%3Aissue+-project%3Acloudflare%2F1+-project%3Acloudflare%2F2+).

Follow these steps to triage an issue.

### Step 0: Is this a Pages or Wrangler issue?

If the issue refers only to Pages commands then apply the `pages` label and add the issue to the [Pages](https://github.com/orgs/cloudflare/projects/2) Github project.

Otherwise, add the issue to the [Wrangler](https://github.com/orgs/cloudflare/projects/1) Github project, set its status to `Untriaged`, and continue to step 1.

### Step 1: Does the issue have enough information?

Gauge whether the issue has enough information to act upon.
This typically includes the version of Wrangler being used and steps to reproduce.

- If the issue may be legitimate but needs more information, add the `needs clarification` label.
- If the issue does not provide clear steps to reproduce the problem then add the `needs reproduction` label.

These labels can be revisited if the author can provide further clarification.
You can see a list of issues that need revisiting by filtering on ["needs reproduction" and "needs clarification"](https://github.com/cloudflare/wrangler2/issues?q=is%3Aopen+is%3Aissue+project%3Acloudflare%2F1+label%3A%22needs+clarification%22).

If the issue does have enough information, move on to step 2.

### Step 2: Type of issue

Change the state of the issue in the [Wrangler](https://github.com/orgs/cloudflare/projects/1) to `Backlog`.

- By default, all issues are considered bugs, apply the `bug` label and a priority label.
- If the issue is a feature request, apply the `enhancement` label. Use your judgement to determine
  whether the feature request is reasonable. If it's clear that the issue requests something
  infeasible, close the issue with a comment explaining why.
- If the issue is an RFC or discussion, apply the `discussion` label.

Unless they're capturing a legitimate bug, redirect requests for debugging help or advice to a more
appropriate channel such as [Discord](https://discord.com/invite/cloudflaredev) or, for paying customers, their
support contact.

### Step 3: Set a Priority

For bug reports, set a priority level in the [Wrangler](https://github.com/orgs/cloudflare/projects/1) GitHub project.

| Label | Description                                                                                                                                                                                                                                          |
| ----- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| P0    | An issue that causes a full outage, breakage, or major function unavailability for everyone, without any known workaround. The issue must be fixed immediately, taking precedence over all other work. Should receive updates at least once per day. |
| P1    | An issue that significantly impacts a large percentage of users; if there is a workaround it is partial or overly painful. The issue should be resolved before the next release.                                                                     |
| P2    | The issue is important to a large percentage of users, with a workaround. Issues that are significantly ugly or painful (especially first-use or install-time issues). Issues with workarounds that would otherwise be P0 or P1.                     |
| P3    | An issue that is relevant to core functions, but does not impede progress. Important, but not urgent.                                                                                                                                                |
| P4    | A relatively minor issue that is not relevant to core functions, or relates only to the attractiveness or pleasantness of use of the system. Good to have but not necessary changes/fixes.                                                           |
| P5    | The team acknowledges the request but (due to any number of reasons) does not plan to work on or accept contributions for this request. The issue remains open for discussion.                                                                       |

Issues marked with "feature" or "discussion" don't require a priority.

### Step 4: Additional labels

The following labels can also be added to issues to provide further information to help prioritize them:

| Label         | Description                                                                                                                   |
| ------------- | ----------------------------------------------------------------------------------------------------------------------------- |
| big idea      | The issue covers a large change that is likely to require significant planning and implementation via multiple PRs.           |
| blocked       | The issue cannot be resolved because it is blocked by another issue, inside or outside the Wrangler project.                  |
| documentation | The issue refers to documentation, error messages or warnings, then apply the `documentation` label.                          |
| internal      | The issue refers to a problem with the Cloudflare internal API or processes that cannot be resolved within Wrangler alone.    |
| maintenance   | The issue refers to changes that will improve the processes of the Wrangler team, rather than Wrangler itself.                |
| polish        | Resolving the issue will improve the Developer Experience when using Wrangler, rather than changing it fundamental behaviour. |
| quick win     | The issue only requires minor changes, and would be a good first contribution to Wrangler                                     |
