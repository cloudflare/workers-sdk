import chalk from 'chalk';
import { dedent } from 'ts-dedent';
import type { Issue } from '../../shared/types';
import { getIssueByNumber } from '../github/get-issue-by-number';
import { fetchSimilarIssues } from './embeddings';

const cloudflareAccountId = process.env.CLOUDFLARE_ACCOUNT_ID;
const cloudflareApiKey = process.env.CLOUDFLARE_API_KEY;
const textGenerationModel = '@cf/meta/llama-3-8b-instruct';

export async function classifyIssue(issue: Issue): Promise<string | null> {
	const similarIssues = await getSimilarIssues(issue);
	const prompt = buildPrompt(issue, similarIssues);
	const aiResponse = await fetchAIClassification(prompt);

	if (!aiResponse) {
		return null;
	}

	const response = dedent`

        ${chalk.gray(chalk.italic('ISSUE DETAILS'))}
        ${chalk.gray('====================')}

        Issue Number: ${issue.number}
        Link: https://github.com/cloudflare/workers-sdk/issues/${issue.number}
        Title: ${issue.title}
        Labels: ${JSON.stringify(issue.labels)}
        Comment Count: ${issue.comments.length}

        ${chalk.gray(chalk.italic('AI RESPONSE'))}
        ${chalk.gray('====================')}

        ${aiResponse}

        ${chalk.gray(chalk.italic('RELATED ISSUES'))}
        ${chalk.gray('====================')}

        ${similarIssues
					.filter((i) => i.number !== issue.number)
					.slice(0, 5)
					.map((issue) => `${issue.title} (https://github.com/cloudflare/workers-sdk/issues/${issue.number})\n`)
					.join('')}
        `;

	return response;
}

export async function getSimilarIssues(issue: Issue): Promise<Issue[]> {
	const matches = await fetchSimilarIssues(issue);
	const matchingIssues = matches.map((match) => match.metadata.issueNumber).map((issueNumber) => getIssueByNumber(issueNumber));
	return await Promise.all(matchingIssues);
}

export async function fetchAIClassification(prompt: string) {
	const messages = [
		{
			role: 'user',
			content: prompt,
		},
	];

	const res = await fetch(`https://api.cloudflare.com/client/v4/accounts/${cloudflareAccountId}/ai/run/${textGenerationModel}`, {
		method: 'POST',
		headers: {
			'Content-Type': 'application/json',
			Authorization: `Bearer ${cloudflareApiKey}`,
		},
		body: JSON.stringify({ messages }),
	});

	const json = (await res.json()) as { result: { response: string } };

	return json.result.response;
}

function buildPrompt(issue: Issue, similarIssues: Issue[]) {
	const prompt = dedent`
        Use the guidelines below, and the subsequent context to classify the provided GitHub issue.
        This classification is intended to help with triaging the issue.

        1. This issue is a duplicate of an issue provided in the context.

        2. Can we close this issue?:
            - The issue has been waiting for a user response for over 1 month.
            - The issue is already solved.
            - Comments suggest it shouldn't be solved (if so, include a comment).

        3. Should this go into the backlog of work?:
            - Comments show it is something that can be done on our end.
            - The issue is obvious.
            - The issue has a reproduction.

        4. Should we request a minimal reproduction from the user?:
            - There is not enough information to determine whether or not it's a bug/issue.

        5. Classify by severity:
            - Major, Minor, Trivial.

        **Issue Details:**

        ${JSON.stringify(issue)}

        Based on these criteria, classify the issue and return the classification in the following format:

        Duplicate: [Issue url] | "No"
        Close issue: "Yes" | "No"
        Close reason: [string]
        Add to backlog: "Yes" | "No"
        Request reproduction: "Yes" | "No"
        Severity: "Major" | "Minor" | "Trivial"

        Then give your reasoning for each of those outputs.

        Do not put any text decoration in your response.

        **Context**

        ${JSON.stringify(similarIssues)}
    `;

	return prompt.slice(0, 6145);
}
