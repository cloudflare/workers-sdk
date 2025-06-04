import JSZip from "jszip";
import type { generateGitHubFetch } from "./gitHubFetch";

interface Artifact {
	name: string;
	archive_download_url: string;
}

const ONE_WEEK = 60 * 60 * 24 * 7;

export const getArtifactForWorkflowRun = async ({
	repo,
	runID,
	name,
	gitHubFetch,
	waitUntil,
}: {
	repo: string;
	runID: number;
	name: string;
	gitHubFetch: ReturnType<typeof generateGitHubFetch>;
	waitUntil: (promise: Promise<unknown>) => void;
}) => {
	const cacheKey = `https://prerelease-registry.devprod.cloudflare.dev/${repo}/runs/${runID}/${name}`;

	const cache = caches.default;

	const cachedResponse = await cache.match(cacheKey);
	if (cachedResponse && cachedResponse.status === 200) {
		return cachedResponse;
	}

	try {
		const artifactsResponse = await gitHubFetch(
			`https://api.github.com/repos/cloudflare/${repo}/actions/runs/${runID}/artifacts`,
			{
				headers: {
					Accept: "application/vnd.github.v3+json",
				},
			}
		);
		if (!artifactsResponse.ok) {
			const responseData = {
				"artifactsResponse.ok": artifactsResponse.ok,
				"artifactsResponse.status": artifactsResponse.status,
				"artifactsResponse.text": await artifactsResponse.text(),
				repo,
				runID,
			};

			if (artifactsResponse.status >= 500) {
				return Response.json(responseData, { status: 502 });
			}

			return Response.json(responseData, { status: 404 });
		}

		const { artifacts } = (await artifactsResponse.json()) as {
			artifacts: Artifact[];
		};

		const artifact = artifacts.find(
			(artifactCandidate) => artifactCandidate.name === name
		);
		if (artifact === undefined) {
			return Response.json(
				{ artifact, name, "artifacts.length": artifacts.length },
				{ status: 404 }
			);
		}

		const redirResponse = await gitHubFetch(artifact.archive_download_url, {
			// Azure will block the request if we auto redirect because
			// it doesn't like the auth header. To work around this, we
			// can fetch the new location in a separate fetch call.
			redirect: "manual",
		});
		if (redirResponse.status !== 302) {
			const responseData = {
				"redirResponse.status": redirResponse.status,
				"redirResponse.text": await redirResponse.text(),
				repo,
				runID,
				"artifact.archive_download_url": artifact.archive_download_url,
			};

			if (redirResponse.status >= 500) {
				return Response.json(responseData, { status: 502 });
			}

			return Response.json(responseData, { status: 404 });
		}

		const location = redirResponse.headers.get("location");
		if (!location) {
			const responseData = {
				"redirResponse.status": redirResponse.status,
				"redirResponse.text": await redirResponse.text(),
				repo,
				runID,
				"artifact.archive_download_url": artifact.archive_download_url,
			};
			return Response.json(responseData, { status: 502 });
		}

		const zipResponse = await fetch(location, {
			headers: {
				"User-Agent": "@cloudflare/workers-sdk/packages/prerelease-registry",
			},
		});
		if (!zipResponse.ok) {
			const responseData = {
				"zipResponse.ok": zipResponse.ok,
				"zipResponse.status": zipResponse.status,
				"zipResponse.text": await zipResponse.text(),
				repo,
				runID,
				"artifact.archive_download_url": artifact.archive_download_url,
			};

			if (zipResponse.status >= 500) {
				return Response.json(responseData, { status: 502 });
			}

			return Response.json(responseData, { status: 404 });
		}

		const zip = new JSZip();
		await zip.loadAsync(await zipResponse.arrayBuffer());

		const files = zip.files;
		const fileNames = Object.keys(files);
		const downloadableFileName = fileNames.find(
			(fileName) => fileName.endsWith(".tgz") || fileName.endsWith(".vsix")
		);
		if (downloadableFileName === undefined) {
			return Response.json({ fileNames }, { status: 404 });
		}

		const downloadableBlob = await files[downloadableFileName].async("blob");
		const response = new Response(downloadableBlob, {
			headers: { "Cache-Control": `public, s-maxage=${ONE_WEEK}` },
		});

		waitUntil(cache.put(cacheKey, response.clone()));

		return response;
	} catch (thrown) {
		return new Response(String(thrown), { status: 500 });
	}
};
