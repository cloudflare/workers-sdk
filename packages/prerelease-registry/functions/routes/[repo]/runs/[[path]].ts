import { getArtifactForWorkflowRun } from "../../../utils/getArtifactForWorkflowRun";
import { generateGitHubFetch } from "../../../utils/gitHubFetch";
import { repos } from "../../../utils/repoAllowlist";

export const onRequestGet: PagesFunction<
	{ GITHUB_API_TOKEN: string; GITHUB_USER: string },
	"path" | "repo"
> = async ({ params, env, waitUntil }) => {
	const { repo, path } = params;

	if (!Array.isArray(path) || !repos.includes(repo as string)) {
		return new Response(null, { status: 404 });
	}

	const runID = parseInt(path[0]);
	const name = path[1];
	if (isNaN(runID) || name === undefined)
		return new Response(null, { status: 404 });

	const gitHubFetch = generateGitHubFetch(env);

	return getArtifactForWorkflowRun({
		repo: repo as string,
		runID,
		name,
		gitHubFetch,
		waitUntil,
	});
};
