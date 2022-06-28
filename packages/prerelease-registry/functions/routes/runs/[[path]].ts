import { getArtifactForWorkflowRun } from "../../utils/getArtifactForWorkflowRun";
import { generateGitHubFetch } from "../../utils/gitHubFetch";

export const onRequestGet: PagesFunction<
	{ GITHUB_API_TOKEN: string; GITHUB_USER: string },
	"path"
> = async ({ params, env, waitUntil }) => {
	const { path } = params;

	if (!Array.isArray(path)) {
		return new Response(null, { status: 404 });
	}

	const runID = parseInt(path[0]);
	const name = path[1];
	if (isNaN(runID) || name === undefined)
		return new Response(null, { status: 404 });

	const gitHubFetch = generateGitHubFetch(env);

	return getArtifactForWorkflowRun({ runID, name, gitHubFetch, waitUntil });
};
