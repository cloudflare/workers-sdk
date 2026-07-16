import { defineWorkflow } from "@flue/runtime";
import * as v from "valibot";
import ciLogAnalyst from "../agents/ci-log-analyst";

const FindingSchema = v.object({
	conclusion: v.picklist(["failure", "timed_out", "cancelled", "unknown"]),
	confidence: v.picklist(["low", "medium", "high"]),
	evidence: v.array(v.string()),
	jobName: v.string(),
	likelyCause: v.string(),
	suggestedFixes: v.array(v.string()),
	summary: v.string(),
});

const AnalysisSchema = v.object({
	classification: v.picklist([
		"actionable_failure",
		"likely_flake",
		"infra_or_timeout",
		"unknown",
	]),
	commentMarkdown: v.string(),
	failedJobs: v.array(FindingSchema),
	overallSummary: v.string(),
	prettifyLikelyFix: v.boolean(),
	recommendedNextSteps: v.array(v.string()),
	timeoutLikelyFlake: v.boolean(),
});

const InputSchema = v.object({
	conclusion: v.picklist(["failure", "timed_out"]),
	logsDirectory: v.string(),
	prNumber: v.number(),
	repository: v.string(),
	runAttempt: v.number(),
	runId: v.string(),
	runUrl: v.string(),
	workflowName: v.string(),
});

export default defineWorkflow({
	agent: ciLogAnalyst,
	input: InputSchema,
	output: AnalysisSchema,

	async run({ harness, input }) {
		const session = await harness.session();
		const { data } = await session.prompt(
			`
Analyze the failed GitHub Actions run for ${input.repository}#${input.prNumber}.

Run metadata:
- Workflow: ${input.workflowName}
- Run ID: ${input.runId}
- Attempt: ${input.runAttempt}
- Conclusion: ${input.conclusion}
- Run URL: ${input.runUrl}
- Downloaded logs directory: ${input.logsDirectory}

Inspect the log files under the downloaded logs directory. Start by listing files, then read the logs for failed or timed-out jobs. You may use shell commands for read-only inspection such as find, sed, rg, grep, tail, or head.

Classify the failure:
- Use "actionable_failure" when the logs point to a code, formatting, config, generated file, changeset, type, lint, or test issue that a contributor should fix.
- Use "likely_flake" when the evidence points to intermittent infrastructure, dependency fetching, runner failure, cancellation, or a timeout with no specific code failure.
- Use "infra_or_timeout" when the failure timed out or was cancelled and the root cause is not clear enough to call it a flake.
- Use "unknown" only when the logs are missing, unreadable, or too ambiguous.

For Checks job failures, look for formatting output from oxfmt, "check:format", "pnpm run check --summarize", or similar. Set prettifyLikelyFix to true only when running \`pnpm run prettify\` is likely to fix the observed failure.

For commentMarkdown:
- Write concise GitHub-flavored Markdown suitable for a PR comment.
- Start with a short summary sentence.
- Include the run link.
- Include one bullet per failed job with evidence and suggested next step.
- Mention \`pnpm run prettify\` only when prettifyLikelyFix is true.
- Keep it under 6000 characters.
			- Do not include hidden HTML markers; the workflow adds those.
			`.trim(),
			{ result: AnalysisSchema }
		);

		return data;
	},
});
