export type GitHubIssueNode = {
	number: number;
	title: string;
	body: string;
	url: string;
	updatedAt: string;
	labels: {
		nodes: { name: string }[];
	};
	assignees: { nodes: { login: string }[] };
	comments: { nodes: GitHubComment[] };
};

type GitHubComment = { author: { login: string } | null; body: string; createdAt: string };
