// flue-blueprint: channel/github@1
import { createGitHubChannel, type GitHubIssueRef } from "@flue/github";
import { defineTool, dispatch } from "@flue/runtime";
import { Octokit } from "@octokit/rest";
import { env } from "cloudflare:workers";
import * as v from "valibot";
import { IssueTriage } from "../agents/issue-triage";

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
					openedBy: issue.user.login,
					owner: issueRef.owner,
					repo: issueRef.repo,
					title: issue.title,
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
		description: `Comment on the GitHub issue or pull request bound to this agent.`,
		input: v.object({
			body: v.pipe(v.string(), v.minLength(1)),
		}),
		name: "comment_on_github_issue",
		run: async ({ data }) => {
			const result = await client.rest.issues.createComment({
				body: data.body,
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
