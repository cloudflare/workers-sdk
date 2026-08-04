// flue-blueprint: channel/github@1
import { createGitHubChannel, type GitHubIssueRef } from "@flue/github";
import { defineTool, dispatch } from "@flue/runtime";
import { Octokit } from "@octokit/rest";
import { env } from "cloudflare:workers";
import * as v from "valibot";
import { GithubAssistant } from "../agents/github-assistant";

export const client = new Octokit({
	auth: env.GITHUB_TOKEN,
});

export const channel = createGitHubChannel({
	webhook: async ({ delivery }) => {
		// Follow-up PRs will add event-specific dispatch for new issues, pull
		// requests, failed CI runs, and explicit bot mentions. Reproduction work
		// will be delegated to one shared sandbox-backed tool rather than handled
		// inside the webhook request.
		if (
			delivery.name === "issue_comment" &&
			delivery.payload.action === "created"
		) {
			const {
				//
				comment,
				installation,
				issue,
				repository,
				sender,
			} = delivery.payload;

			const issueRef = {
				issueNumber: issue.number,
				owner: repository.owner.login,
				repo: repository.name,
			} satisfies GitHubIssueRef;

			await dispatch(GithubAssistant, {
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
						commentId: String(comment.id),
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
					body: comment.body,
					kind: "signal",
					type: "github.issue_comment.created",
				},
			});

			return undefined;
		}

		if (
			delivery.name === "pull_request_review_comment" &&
			delivery.payload.action === "created"
		) {
			const {
				//
				comment,
				installation,
				pull_request,
				repository,
				sender,
			} = delivery.payload;

			const issueRef = {
				issueNumber: pull_request.number,
				owner: repository.owner.login,
				repo: repository.name,
			} satisfies GitHubIssueRef;

			await dispatch(GithubAssistant, {
				id: channel.instanceId(issueRef),
				initialData: {
					issueNumber: issueRef.issueNumber,
					openedBy: pull_request.user.login,
					owner: issueRef.owner,
					repo: issueRef.repo,
					title: pull_request.title,
				},
				message: {
					attributes: {
						commentId: String(comment.id),
						deliveryId: delivery.deliveryId,
						...(installation === undefined
							? {}
							: { installationId: String(installation.id) }),
						issueNumber: String(issueRef.issueNumber),
						...(comment.line === null || comment.line === undefined
							? {}
							: { line: String(comment.line) }),
						owner: issueRef.owner,
						path: comment.path,
						repo: issueRef.repo,
						sender: sender.login,
						threadId: String(comment.in_reply_to_id ?? comment.id),
						title: pull_request.title,
					},
					body: comment.body,
					kind: "signal",
					type: "github.pull_request_review_comment.created",
				},
			});

			return undefined;
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
