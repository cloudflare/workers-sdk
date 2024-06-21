import { fetchGraphQlResponse } from './fetch-graphql-response';
import { Issue } from '../../shared/types';

/**
 * The projectId of the workers-sdk project
 * https://github.com/orgs/cloudflare/projects/1
 */
const PROJECT_ID = 'PVT_kwDOAATLF84AAb5f';

export async function getUntriagedIssues(): Promise<Issue[]> {
	let cursor: string | null = null;
	let hasNextPage = true;
	const allItems: Issue[] = [];

	while (hasNextPage) {
		const items = await fetchProjectItems(cursor);

		const filteredResults = items.nodes.filter(isNodeWithContent).filter(isUntriaged).map(toFormattedIssue);

		allItems.push(...filteredResults);

		cursor = items.pageInfo.endCursor;
		hasNextPage = items.pageInfo.hasNextPage;
	}

	return allItems;
}

export async function fetchProjectItems(cursor: string | null): Promise<GitHubItems> {
	const cursorParam = cursor ? `, after: "${cursor}"` : '';

	const query = `
    query {
      node(id: "${PROJECT_ID}") {
        ... on ProjectV2 {
          items(first: 100 ${cursorParam}) {
            pageInfo {
              endCursor
              hasNextPage
            }
            nodes {
              id
              fieldValues(first: 100) {
                nodes {
                  ... on ProjectV2ItemFieldSingleSelectValue {
                    name
                    field {
                      ... on ProjectV2SingleSelectField {
                        name
                      }
                    }
                  }
                  ... on ProjectV2ItemFieldTextValue {
                    text
                    field {
                      ... on ProjectV2FieldCommon {
                        name
                      }
                    }
                  }
                }
              }
              content {
                ... on Issue {
                  title
                  number
                  url
                  body
				  updatedAt
                  labels(first: 10) {
                    nodes {
                      name
                    }
                  }
                  assignees(first: 10) {
                    nodes {
                      login
                    }
                  }
                  comments(first: 100) {
                    nodes {
                      body
                      author {
                        login
                      }
                      createdAt
                    }
                  }
                }
              }
            }
          }
        }
      }
    }
  `;

	const res = await fetchGraphQlResponse<GitHubIssuesResponse>(query);

	return res.data.node.items;
}

function toFormattedIssue(node: GitHubNodeWithContent): Issue {
	const { content } = node;

	return {
		title: content.title,
		number: content.number,
		url: content.url,
		body: content.body,
		updatedAt: content.updatedAt,
		labels: content.labels.nodes.map((label) => label.name),
		assignees: content.assignees.nodes.map((assignee) => assignee.login),
		comments: content.comments.nodes.map((comment) => ({
			body: comment.body,
			author: comment.author?.login || 'Unknown',
			createdAt: comment.createdAt,
		})),
		status: node.fieldValues.nodes.find((field) => field.field?.name === 'Status')?.name || 'Unknown',
	};
}

function isUntriaged(node: GitHubNodeWithContent) {
	return node.fieldValues.nodes.find((field) => field.field?.name === 'Status')?.name === 'Untriaged';
}

function isNodeWithContent(node: GitHubNode): node is GitHubNodeWithContent {
	const { content } = node;

	return Boolean(content && content.title && content.number && content.url);
}

type GitHubItems = {
	pageInfo: {
		endCursor: string;
		hasNextPage: boolean;
	};
	nodes: GitHubNode[];
};

type GitHubIssuesResponse = {
	data: {
		node: {
			items: {
				pageInfo: {
					endCursor: string;
					hasNextPage: boolean;
				};
				nodes: GitHubNode[];
			};
		};
	};
};

type GitHubNode = {
	fieldValues: {
		nodes: {
			field?: {
				name: string;
			};
			name?: string;
		}[];
	};
	content?: GitHubContent;
};

type GitHubNodeWithContent = GitHubNode & {
	content: GitHubContent;
};

type GitHubContent = {
	title: string;
	number: number;
	url: string;
	body: string;
	updatedAt: string;
	labels: {
		nodes: {
			name: string;
		}[];
	};
	assignees: {
		nodes: {
			login: string;
		}[];
	};
	comments: {
		nodes: {
			body: string;
			author?: {
				login: string;
			};
			createdAt: string;
		}[];
	};
};
