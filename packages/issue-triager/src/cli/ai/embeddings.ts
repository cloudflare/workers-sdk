import { Issue } from '../../shared/types';

const workerBaseUrl = process.env.WORKER_BASE_URL as string;
const issueTriagerApiKey = process.env.ISSUE_TRIAGER_API_KEY as string;

export async function embedIssues(issues: Issue[]): Promise<string> {
	const response = await fetch(`${workerBaseUrl}/embeddings`, {
		method: 'POST',
		headers: {
			'Content-Type': 'application/json',
			'issue-triager-api-key': issueTriagerApiKey,
		},
		body: JSON.stringify(issues),
	});
	const json = (await response.json()) as { message: string };

	return json.message;
}

type Match = { id: number; metadata: { id: number; issueNumber: number }; score: number };
export async function fetchSimilarIssues(issue: Issue): Promise<Match[]> {
	const response = await fetch(`${workerBaseUrl}/embeddings/similar`, {
		method: 'POST',
		headers: {
			'Content-Type': 'application/json',
			'issue-triager-api-key': issueTriagerApiKey,
		},
		body: JSON.stringify(issue),
	});

	return response.json() as Promise<Match[]>;
}

export async function fetchLastUpdatedTimestamp(): Promise<string> {
	const response = await fetch(`${workerBaseUrl}/embeddings/last_updated_at`, {
		headers: {
			'Content-Type': 'application/json',
			'issue-triager-api-key': issueTriagerApiKey,
		},
	});

	const json = (await response.json()) as { data: string };

	return json.data;
}

export async function setLastUpdatedTimestamp(date: string): Promise<string> {
	const response = await fetch(`${workerBaseUrl}/embeddings/last_updated_at`, {
		method: 'POST',
		headers: {
			'Content-Type': 'application/json',
			'issue-triager-api-key': issueTriagerApiKey,
		},
		body: date,
	});

	const json = (await response.json()) as { message: string };

	return json.message;
}
