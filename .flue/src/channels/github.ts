// flue-blueprint: channel/github@1
import { createGitHubChannel, type GitHubIssueRef } from "@flue/github";
import { defineTool, dispatch } from "@flue/runtime";
import { Octokit } from "@octokit/rest";
import { env } from "cloudflare:workers";
import * as v from "valibot";
import githubAssistant from "../agents/github-assistant";

export const client = new Octokit({
	auth: env.GITHUB_TOKEN,
});

export const channel = createGitHubChannel({
	webhook: async ({ delivery }) => {
		if (
			delivery.name === "issue_comment" &&
			delivery.payload.action === "created"
		) {
			const { comment, issue, repository } = delivery.payload;
			const issueRef = {
				issueNumber: issue.number,
				owner: repository.owner.login,
				repo: repository.name,
			} satisfies GitHubIssueRef;

			await dispatch(githubAssistant, {
				id: channel.conversationKey(issueRef),
				input: {
					comment: { body: comment.body, id: comment.id },
					deliveryId: delivery.deliveryId,
					installationId: delivery.payload.installation?.id,
					issue: issueRef,
					sender: delivery.payload.sender,
					type: "github.issue_comment.created",
				},
			});

			return undefined;
		}

		if (
			delivery.name === "pull_request_review_comment" &&
			delivery.payload.action === "created"
		) {
			const { comment, pull_request, repository } = delivery.payload;
			const issueRef = {
				issueNumber: pull_request.number,
				owner: repository.owner.login,
				repo: repository.name,
			} satisfies GitHubIssueRef;

			await dispatch(githubAssistant, {
				id: channel.conversationKey(issueRef),
				input: {
					comment: {
						body: comment.body,
						id: comment.id,
						threadId: comment.in_reply_to_id ?? comment.id,
					},
					deliveryId: delivery.deliveryId,
					installationId: delivery.payload.installation?.id,
					issue: issueRef,
					sender: delivery.payload.sender,
					type: "github.pull_request_review_comment.created",
				},
			});
		}

		return undefined;
	},
	webhookSecret: env.GITHUB_WEBHOOK_SECRET,
});

/**
 * Creates a tool scoped to one verified GitHub issue or pull request
 */
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
		run: async ({ input: { body } }) => {
			const result = await client.rest.issues.createComment({
				body,
				issue_number: ref.issueNumber,
				owner: ref.owner,
				repo: ref.repo,
			});
			return {
				commentId: result.data.id,
				url: result.data.html_url,
			};
		},
	});
}
