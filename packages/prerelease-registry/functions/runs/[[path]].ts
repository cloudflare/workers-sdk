import JSZip from "jszip";

interface Artifact {
  id: number;
  node_id: string;
  name: string;
  size_in_bytes: number;
  url: string;
  archive_download_url: string;
  expired: boolean;
  created_at: string;
  updated_at: string;
  expires_at: string;
}

export const onRequestGet: PagesFunction<
  { GITHUB_API_TOKEN: string },
  "path"
> = async ({ request, params, env, waitUntil }) => {
  const cache = caches.default;

  const cachedResponse = await cache.match(request);
  if (cachedResponse) return cachedResponse;

  const { path } = params;

  if (!Array.isArray(path)) {
    return new Response(null, { status: 404 });
  }

  const runID = parseInt(path[0]);
  const name = path[1];
  if (isNaN(runID) || name === undefined)
    return new Response(null, { status: 404 });

  const gitHubFetch = (
    resource: Request | string,
    init?: RequestInit | Request
  ) => {
    let gitHubRequest = new Request(resource, init);
    gitHubRequest = new Request(gitHubRequest.clone());

    gitHubRequest.headers.set(
      "Authorization",
      `Basic ${btoa(`gregbrimble:${env.GITHUB_API_TOKEN}`)}`
    );
    gitHubRequest.headers.set(
      "User-Agent",
      "@cloudflare/wrangler2/packages/prerelease-registry"
    );

    return fetch(gitHubRequest);
  };

  const artifactsResponse = await gitHubFetch(
    `https://api.github.com/repos/cloudflare/wrangler2/actions/runs/${runID}/artifacts`,
    {
      headers: {
        Accept: "application/vnd.github.v3+json",
      },
    }
  );
  if (!artifactsResponse.ok) {
    if (artifactsResponse.status >= 500)
      return new Response(null, { status: 502 });

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

  const zip = new JSZip();
  await zip.loadAsync(await zipResponse.arrayBuffer());

  const files = zip.files;
  const fileNames = Object.keys(files);
  const tgzFileName = fileNames.find((fileName) => fileName.endsWith(".tgz"));
  if (tgzFileName === undefined) return new Response(null, { status: 404 });

  const tgzBlob = await files[tgzFileName].async("blob");
  const response = new Response(tgzBlob);

  waitUntil(cache.put(request, response.clone()));

  return response;
};
