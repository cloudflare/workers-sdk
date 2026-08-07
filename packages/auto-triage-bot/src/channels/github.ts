// flue-blueprint: channel/github@1
import { createGitHubChannel, type GitHubIssueRef } from "@flue/github";
import { defineTool, dispatch } from "@flue/runtime";
import { Octokit } from "@octokit/rest";
import { env } from "cloudflare:workers";
import * as v from "valibot";
import { IssueTriage } from "../agents/issue-triage";

const COMMENT_BY_OUTCOME = {
	"not-reproduced": "- **Reproduction:** ❌ Could not reproduce.",
	reproduced: "- **Reproduction:** ✅ Successfully reproduced.",
} as const;

const CommentDetailsSchema = v.pipe(
	v.string(),
	v.trim(),
	v.minLength(1),
	v.maxLength(300),
	v.regex(/^[^\r\n]+$/u, "Details must fit on one line."),
	v.regex(/^[^@]*$/u, "Details must not contain @mentions."),
	v.regex(/^[^<>]*$/u, "Details must not contain HTML."),
	v.regex(
		/^(?!.*(?:[a-z][a-z0-9+.-]*:\/\/|www\.|\[[^\]]+\]\([^)]+\))).*$/iu,
		"Details must not contain links."
	)
);

export const client = new Octokit({
	auth: env.GITHUB_TOKEN,
});

export const channel = createGitHubChannel({
	// Path: /channels/github/webhook
	webhook: async ({ delivery }) => {
		if (delivery.name === "issues" && delivery.payload.action === "opened") {
			const { installation, issue, repository, sender } = delivery.payload;

			const issueRef = {
				issueNumber: issue.number,
				owner: repository.owner.login,
				repo: repository.name,
			} satisfies GitHubIssueRef;

			await dispatch(IssueTriage, {
				id: channel.instanceId(issueRef),
				initialData: {
					issueNumber: issueRef.issueNumber,
					owner: issueRef.owner,
					repo: issueRef.repo,
				},
				message: {
					attributes: {
						deliveryId: delivery.deliveryId,
						...(installation === undefined
							? {}
							: { installationId: String(installation.id) }),
						issueNumber: String(issueRef.issueNumber),
						owner: issueRef.owner,
						repo: issueRef.repo,
						sender: sender.login,
						title: issue.title,
					},
					body: `Issue description:\n${issue.body ?? "(No description provided.)"}`,
					kind: "signal",
					type: "github.issue.opened",
				},
			});

			return undefined;
		}

		return undefined;
	},
	webhookSecret: env.GITHUB_WEBHOOK_SECRET,
});

export function commentOnIssue(ref: {
	issueNumber: number;
	owner: string;
	repo: string;
}) {
	return defineTool({
		description: `Report whether the GitHub issue bound to this agent was reproduced, with brief factual details.`,
		input: v.object({
			details: CommentDetailsSchema,
			outcome: v.picklist(["reproduced", "not-reproduced"]),
		}),
		name: "comment_on_github_issue",
		run: async ({ data }) => {
			const result = await client.rest.issues.createComment({
				body: `${COMMENT_BY_OUTCOME[data.outcome]} ${data.details}`,
				issue_number: ref.issueNumber,
				owner: ref.owner,
				repo: ref.repo,
			});

			return {
				output: {
					commentId: result.data.id,
					url: result.data.html_url,
				},
			};
		},
	});
}
