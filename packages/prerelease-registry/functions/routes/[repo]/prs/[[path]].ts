import { getArtifactForWorkflowRun } from "../../../utils/getArtifactForWorkflowRun";
import { generateGitHubFetch } from "../../../utils/gitHubFetch";
import { repos } from "../../../utils/repoAllowlist";

interface PullRequest {
	head: { ref: string; sha: string };
}

interface WorkflowRun {
	id: number;
	head_sha: string;
	workflow_id: number;
}

const WORKFLOW_ID = 19014954;

export const onRequestGet: PagesFunction<
	{ GITHUB_API_TOKEN: string; GITHUB_USER: string },
	"path" | "repo"
> = async ({ params, env, waitUntil }) => {
	const { repo, path } = params;

	if (!Array.isArray(path) || !repos.includes(repo as string)) {
		return new Response(null, { status: 404 });
	}

	const pullRequestID = parseInt(path[0]);
	const name = path[1];
	if (isNaN(pullRequestID) || name === undefined)
		return new Response(null, { status: 404 });

	const gitHubFetch = generateGitHubFetch(env);

	try {
		const pullRequestsResponse = await gitHubFetch(
			`https://api.github.com/repos/cloudflare/${repo}/pulls/${pullRequestID}`,
			{
				headers: {
					Accept: "application/vnd.github.v3+json",
				},
			}
		);
		if (!pullRequestsResponse.ok) {
			if (pullRequestsResponse.status >= 500) {
				return new Response(null, { status: 502 });
			}

			return new Response(null, { status: 404 });
		}

		const {
			head: { ref: branch, sha },
		} = (await pullRequestsResponse.json()) as PullRequest;

		const workflowRunsResponse = await gitHubFetch(
			`https://api.github.com/repos/cloudflare/${repo}/actions/runs?branch=${branch}&per_page=100&event=pull_request`,
			{
				headers: {
					Accept: "application/vnd.github.v3+json",
				},
			}
		);
		if (!workflowRunsResponse.ok) {
			if (workflowRunsResponse.status >= 500) {
				return new Response(null, { status: 502 });
			}

			return new Response(null, { status: 404 });
		}

		const { workflow_runs: workflowRuns } =
			(await workflowRunsResponse.json()) as {
				workflow_runs: WorkflowRun[];
			};

		const workflowRun = workflowRuns.find(
			(workflowRunCandidate) =>
				workflowRunCandidate.head_sha === sha &&
				workflowRunCandidate.workflow_id === WORKFLOW_ID
		);
		if (workflowRun === undefined) return new Response(null, { status: 404 });

		return getArtifactForWorkflowRun({
			repo: repo as string,
			runID: workflowRun.id,
			name,
			gitHubFetch,
			waitUntil,
		});
	} catch (thrown) {
		return new Response(null, { status: 500 });
	}
};
