# Workers SDK Flue Roadmap

This document describes the intended direction for Workers SDK automation built
with Flue. The work should be delivered as a series of focused pull requests,
with each feature remaining advisory until its behaviour is well understood.

The goal is not to create one large agent that can mutate anything in the
repository. The goal is to provide maintainers with timely, useful analysis
while keeping permissions, event routing, and side effects narrow and
auditable.

## Principles

- Keep maintainers in control. Suggestions, labels, and duplicate candidates
  are advisory unless a later pull request explicitly introduces stronger
  automation.
- Prefer one coordinating agent for each major domain, such as issue triage or
  pull request triage, with shared tools for focused capabilities. Do not create
  a separate agent or workflow for every individual check.
- Use GitHub webhooks for event-driven analysis. A GitHub Actions workflow is
  not required merely to notify Flue that an issue, pull request, comment, or CI
  run changed.
- Use a Flue workflow only when work is durable or multi-step, such as checking
  out a repository, running tests, reproducing an issue, or recovering from an
  interrupted task.
- Keep all GitHub writes scoped to the repository and issue or pull request
  that caused the verified webhook event.
- Deliver features independently so each pull request can establish its own
  behaviour, tests, permissions, and rollback path.
- Reuse useful behaviour from existing Workers SDK automation rather than
  replacing proven workflows all at once.

## Current state

### Flue foundation completed on this branch

- `.flue` is a private member of the main pnpm and Turbo workspaces rather than
  a standalone pnpm workspace.
- The project targets Flue v2, currently using the v2 nightly packages, Vite,
  and the Cloudflare target.
- The Worker uses Cloudflare Workers AI through Flue's Cloudflare provider.
- The Hono application exposes the Flue GitHub channel and does not expose a
  public agent route.
- Incoming GitHub webhook signatures are verified with
  `GITHUB_WEBHOOK_SECRET`.
- Outbound GitHub API calls currently use `GITHUB_TOKEN`.
- Created issue comments and pull request review comments are dispatched to a
  typed, dispatch-only `GithubAssistant` agent.
- The assistant has a narrowly scoped tool for commenting only on the issue or
  pull request associated with the verified event.
- The GitHub channel records delivery and thread metadata that later routing
  and deduplication can use.
- The temporary workspace smoke agent, smoke route, `FLUE_BEARER_TOKEN`, and
  bearer authentication middleware have been removed. They were useful only
  for validating the initial Cloudflare Shell integration and are not part of
  the product architecture.
- A Cloudflare Shell sandbox adapter remains available for future agents that
  need an isolated, durable workspace, structured file operations, or
  JavaScript execution through Codemode.
- The Cloudflare Shell adapter intentionally does not provide a general shell
  `exec()` implementation. Tasks that need Git, native binaries, package
  installation, or real test commands will need Cloudflare Sandbox, GitHub
  Actions, or another isolated Linux execution environment.
- Build, local development, type generation, strict TypeScript configuration,
  generated-file ignores, and setup documentation are present.
- Repository validation includes the hidden `.flue/package.json` explicitly
  without scanning unrelated hidden workspaces such as `.opencode`.

### Existing repository automation outside Flue

Several parts of the desired behaviour already exist through GitHub Actions or
other repository automation:

- `.github/workflows/triage-issue.yml` and
  `.github/skills/issue-review.md` assess issues, produce an advisory report,
  apply validated labels, and update the existing report when an issue is
  retriaged.
- The Bonk workflows can review pull requests and respond to configured
  mentions.
- Changeset review already runs as a dedicated workflow.
- Remote E2E execution is controlled by labels, with supporting rerun and
  external-fork workflows.

These are migration inputs, not obsolete code. A Flue feature should reuse
their prompts, policy, output conventions, and safety constraints where they
remain useful. Existing automation should be removed only after its Flue
replacement has equivalent coverage and has been proven in normal use.

### Not implemented in Flue yet

The current `GithubAssistant` is a foundation for verified, scoped replies. It
does not yet:

- triage newly opened issues or pull requests;
- assess whether an issue has merit;
- search for duplicates;
- detect or label possible AI-authored submissions;
- reproduce issues or run repository commands;
- analyse changesets or post inline pull request reviews;
- recommend or add remote-test labels;
- analyse failed CI logs; or
- route explicit bot mentions to named actions.

## Agent and workflow shape

The intended structure is:

| Capability                     | Agent or tool                                                  | Flue workflow                                    |
| ------------------------------ | -------------------------------------------------------------- | ------------------------------------------------ |
| Issue merit and overall triage | One `IssueTriage` agent with focused tools                     | Only when reproduction is requested              |
| Duplicate detection            | Shared GitHub search and similarity tool used by triage agents | No                                               |
| Possible AI detection          | Shared deterministic signals plus model assessment             | No                                               |
| Issue reproduction             | Handoff from `IssueTriage`                                     | One shared checkout and execution workflow       |
| Pull request analysis          | One `PullRequestTriage` agent with review tools                | Only when checkout or test execution is required |
| Changeset analysis             | Focused tool or task within `PullRequestTriage`                | No, unless repository execution is required      |
| Remote E2E recommendation      | Focused check within `PullRequestTriage`                       | No                                               |
| Failed CI analysis             | Focused tool or subagent associated with pull request triage   | Only for durable log or reproduction work        |
| Explicit bot mentions          | Deterministic router into the relevant agent or task           | Depends on the requested action                  |

This keeps conversational context at the issue or pull request level without
turning every check into a long-lived agent instance.

## Planned delivery

Each phase below should normally be its own pull request.

### 1. Production webhook baseline

- Deploy the Flue Worker and configure `GITHUB_TOKEN` and
  `GITHUB_WEBHOOK_SECRET`.
- Subscribe the GitHub webhook only to events that have implemented handlers.
- Add focused tests for signature verification, event routing, scoped writes,
  and ignored events.
- Add idempotency based on webhook delivery IDs so retried deliveries cannot
  create duplicate work or comments.
- Establish a stable hidden marker and update-in-place convention for automated
  comments.
- Add enough logging to correlate a GitHub delivery, Flue agent instance, and
  outbound GitHub write without recording secrets.

### 2. New issue merit analysis

- Handle the `issues.opened` event and dispatch an `IssueTriage` agent.
- Fetch the complete issue body and the minimum repository context needed for
  triage.
- Reuse applicable policy and output structure from the existing issue-review
  skill.
- Assess whether the report is actionable, identify missing information, infer
  the likely component, and recommend the next maintainer action.
- Post one clearly marked advisory summary to the issue.
- Do not automatically close an issue solely because the model considers it
  invalid or low quality.
- Decide how comment-driven retriage will coexist with the existing issue
  triage workflow before enabling both paths.

### 3. Possible AI labelling

- Evaluate newly opened issues and pull requests for weak indicators of AI
  authorship. Signals may include usernames containing `ai`, repeated templated
  phrasing, excessive em dash usage, unusual line wrapping, and other textual
  patterns.
- Combine multiple signals rather than treating a single writing habit as
  proof.
- Apply the advisory `possible-ai` label when the configured threshold is met.
- Do not post an accusation or treat the label as evidence that a submission is
  invalid.
- Make the label easy for maintainers to remove. False positives are acceptable
  because the label exists only to help maintainers calibrate their review.
- Share the detection implementation between issue and pull request triage
  rather than creating an AI-detection agent.

### 4. Duplicate detection

- Search existing issues and pull requests using the submission title, body,
  affected package, error messages, and other high-signal terms.
- Consider both an existing issue describing the same problem and an existing
  pull request attempting to fix it.
- Rank candidates by similarity and ask the triage model to explain the match.
- When confidence is high enough, post a comment linking the likely duplicate
  or duplicates and explaining why they appear related.
- Leave the final close or merge decision to a maintainer. Do not automatically
  close reports as duplicates in the first version.
- Cache or bound searches so this feature does not make an excessive number of
  GitHub API calls.

### 5. Reproduction workflow

- Let `IssueTriage` decide whether reproduction would materially improve the
  assessment. Do not reproduce every issue by default.
- Hand reproduction to one shared Flue workflow rather than embedding a long
  checkout and test process in the webhook request or creating one workflow per
  issue type.
- Run untrusted issue instructions and repository code in an isolated
  environment with no unnecessary credentials.
- Use Cloudflare Shell for structured workspace analysis where it is
  sufficient. Use Cloudflare Sandbox, GitHub Actions, or an equivalent isolated
  Linux environment when real shell commands and tests are required.
- Record the exact revision, commands, environment, and relevant output.
- Return a concise result to `IssueTriage`, which updates the existing advisory
  comment with whether the issue was reproduced and what failed.
- Add explicit time, cost, output-size, and concurrency limits before enabling
  reproduction broadly.

### 6. Pull request triage and inline review

- Handle `pull_request.opened`, `pull_request.synchronize`, and, if useful,
  `pull_request.ready_for_review` events.
- Dispatch one `PullRequestTriage` agent with the pull request metadata and
  changed files.
- Assess whether the change matches its description, has appropriate tests,
  follows repository conventions, and includes a valid changeset when needed.
- Migrate useful behaviour from the existing pull request and changeset review
  automation incrementally.
- Add a GitHub review tool that can create inline review comments against the
  correct file, side, line, and head revision.
- Prefer one coherent review with inline comments over a collection of
  unrelated top-level pull request comments.
- Deduplicate findings across synchronize events and avoid commenting on stale
  lines.
- Keep findings advisory and allow maintainers to resolve or dismiss them.

### 7. Remote E2E recommendation

- Inspect the pull request description, labels, and changed paths to determine
  whether remote E2E coverage is likely to add value.
- Initially post a maintainer-facing recommendation to add
  `ci:run-remote-tests`, rather than applying it automatically.
- Explain which changed behaviour appears to require remote services so the
  recommendation is reviewable.
- Avoid repeating the recommendation after the label is present or a
  maintainer has responded.
- Consider automatic labelling only after measuring recommendation quality and
  verifying the exact permissions and secret behaviour for internal and forked
  pull requests.

### 8. Failed CI analysis

- Handle completed, failed CI runs and associate each run with its pull request
  and revision.
- Fetch only the failed jobs and relevant log sections through the GitHub API.
- Classify common failures such as formatting, linting, type errors, test
  failures, infrastructure problems, authentication failures, and likely
  flakes.
- Suggest a concrete next step when possible, such as running `pnpm prettify`,
  fixing a named test, or rerunning a likely flaky job.
- Post or update one pull request comment containing the failed jobs, likely
  cause, supporting log excerpts, confidence, and recommended action.
- Do not automatically rerun jobs or push fixes in the first version.
- Deduplicate analysis by workflow run and revision.

### 9. Explicit bot mentions and requested actions

- Add deterministic mention and command parsing for issue comments and pull
  request review threads.
- Route supported requests to explicit actions, initially including pull
  request review and a proposed quick fix.
- Reply in the originating review thread when the request came from an inline
  comment.
- Require clear authorization rules before mutations such as pushing a branch,
  editing labels, rerunning CI, or opening a pull request.
- Treat requests from maintainers, collaborators, and untrusted users
  differently where the requested action has side effects or access to
  credentials.
- Return a clear supported-actions message for unknown commands instead of
  guessing the user's intent.

### 10. GitHub App authentication

The initial implementation deliberately uses `GITHUB_TOKEN` so feature work is
not blocked on application setup. A later pull request should:

- replace the long-lived token with short-lived GitHub App installation
  tokens;
- request only the issue, pull request, Actions, contents, and metadata
  permissions that implemented features require;
- use the installation information already supplied by webhook deliveries;
- document token rotation, webhook-secret rotation, and recovery procedures;
  and
- preserve the same repository and thread scoping enforced by the current
  tools.

## Cross-cutting requirements

Every feature pull request should cover the applicable items below:

- Validate webhook signatures before parsing or dispatching event content.
- Treat issue bodies, comments, pull request diffs, repository files, and CI
  logs as untrusted input.
- Keep credentials out of prompts, logs, sandboxes, and generated comments.
- Use least-privilege GitHub permissions and narrowly scoped tools.
- Make webhook processing idempotent and safe to retry.
- Keep automated comments identifiable and updateable rather than creating
  repeated comments.
- Record why a label, duplicate candidate, reproduction decision, or CI
  diagnosis was produced.
- Add fixtures or tests for normal events, malformed input, retries, forked
  pull requests, deleted or outdated lines, and GitHub API failures.
- Measure false positives, false negatives, latency, model cost, and maintainer
  overrides before increasing automation.
- Provide a straightforward way to disable each feature without disabling the
  entire GitHub channel.

## Reference implementations

Review these projects again when implementing the relevant feature rather than
copying their structure blindly:

- [withastro/triagebot-action](https://github.com/withastro/triagebot-action)
  for prior art in repository triage automation.
- [Emdash's Flue configuration](https://github.com/emdash-cms/emdash/tree/main/.flue)
  for an in-house example of a larger Flue setup.
- The current Flue v2 documentation and checked-in Cloudflare examples. Flue is
  still evolving, so generated blueprints and nightly APIs must be verified
  against the installed version before each feature is implemented.

## Long-term outcome

When this roadmap is complete, maintainers should receive one coherent,
traceable analysis for each issue, pull request, or failed CI run. The system
should identify likely duplicates, flag possible AI-authored submissions,
recommend reproduction or remote testing when useful, place review findings on
the relevant lines, and respond to explicit maintainer requests. It should do
so without granting a general-purpose agent broad write access to the
repository or requiring GitHub Actions solely for event delivery.
