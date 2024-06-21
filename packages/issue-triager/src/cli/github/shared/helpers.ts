import { Issue } from '../../../shared/types';
import { GitHubIssueNode } from './types';

export function toFormattedIssue(issue: GitHubIssueNode): Issue {
	return {
		title: issue.title,
		number: issue.number,
		url: issue.url,
		body: issue.body,
		updatedAt: issue.updatedAt,
		labels: issue.labels.nodes.map((label) => label.name),
		assignees: issue.assignees.nodes.map((assignee) => assignee.login),
		comments: issue.comments.nodes.map((node) => ({
			body: node.body,
			author: node.author?.login,
			createdAt: node.createdAt,
		})),
	} as Issue;
}
