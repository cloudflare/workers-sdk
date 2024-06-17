import { fetchGraphQlResponse } from './fetch-graphql-response';
import { Issue } from '../../shared/types';
import { GitHubIssueNode } from './shared/types';
import { toFormattedIssue } from './shared/helpers';
import { issueQuery } from './shared/queres';

export async function getIssueByNumber(issueNumber: number): Promise<Issue> {
	const issue = await fetchIssueByNumber(issueNumber);
	return toFormattedIssue(issue);
}

async function fetchIssueByNumber(issueNumber: number) {
	const query = `
      query {
        repository(owner: "cloudflare", name: "workers-sdk") {
          issue(number: ${issueNumber}) {
            ${issueQuery}
          }
        }
      }
    `;

	const res = await fetchGraphQlResponse<GitHubRepoIssueResponse>(query);

	return res.data.repository.issue;
}

type GitHubRepoIssueResponse = {
	data: {
		repository: {
			issue: GitHubIssueNode;
		};
	};
};
