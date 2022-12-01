import JSZip from "jszip";
import type { generateGitHubFetch } from "./gitHubFetch";
interface Artifact {
	name: string;
	archive_download_url: string;
}

const ONE_WEEK = 60 * 60 * 24 * 7;

export const getArtifactForWorkflowRun = async ({
	runID,
	name,
	gitHubFetch,
	waitUntil,
}: {
	runID: number;
	name: string;
	gitHubFetch: ReturnType<typeof generateGitHubFetch>;
	waitUntil: (promise: Promise<unknown>) => void;
}) => {
	const cacheKey = `https://prerelease-registry.devprod.cloudflare.dev/runs/${runID}/${name}`;

	const cache = caches.default;

	const cachedResponse = await cache.match(cacheKey);
	if (cachedResponse) return cachedResponse;

	try {
		const artifactsResponse = await gitHubFetch(
			`https://api.github.com/repos/cloudflare/wrangler2/actions/runs/${runID}/artifacts`,
			{
				headers: {
					Accept: "application/vnd.github.v3+json",
				},
			}
		);
		if (!artifactsResponse.ok) {
			if (artifactsResponse.status >= 500) {
				return new Response(null, { status: 502 });
			}

			return new Response(null, { status: 404 });
		}

		const { artifacts } = (await artifactsResponse.json()) as {
			artifacts: Artifact[];
		};

		const artifact = artifacts.find(
			(artifactCandidate) => artifactCandidate.name === name
		);
		if (artifact === undefined) return new Response(null, { status: 404 });

		const zipResponse = await gitHubFetch(artifact.archive_download_url);
		if (!zipResponse.ok) {
			if (zipResponse.status >= 500) {
				return new Response(null, { status: 502 });
			}

			return new Response(null, { status: 404 });
		}

		const zip = new JSZip();
		await zip.loadAsync(await zipResponse.arrayBuffer());

		const files = zip.files;
		const fileNames = Object.keys(files);
		const tgzFileName = fileNames.find((fileName) => fileName.endsWith(".tgz"));
		if (tgzFileName === undefined) return new Response(null, { status: 404 });

		const tgzBlob = await files[tgzFileName].async("blob");
		const response = new Response(tgzBlob, {
			headers: { "Cache-Control": `public, s-maxage=${ONE_WEEK}` },
		});

		waitUntil(cache.put(cacheKey, response.clone()));

		return response;
	} catch (thrown) {
		return new Response(null, { status: 500 });
	}
};
