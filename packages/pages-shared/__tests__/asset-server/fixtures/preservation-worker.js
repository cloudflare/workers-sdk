// Local-only browser probe. The control endpoints never ship with asset-server.
import { generateHandler } from "../../../asset-server/handler";

let deployment = 1;
const events = [];
const document = (
	version
) => `<!doctype html><html><title>Preservation SPA probe</title>
<h1>SPA version ${version}</h1>
<button id="warm">Warm old assets</button>
<button id="deploy">Switch deployment</button>
<button id="load">Load old lazy chunk and data</button>
<a href="/lazy-v1.js" target="_blank">Navigate to deleted chunk</a>
<p id="result">Ready</p><pre id="events"></pre>
<script type="module">
const result = document.querySelector('#result');
async function showEvents() {
 document.querySelector('#events').textContent = JSON.stringify(await (await fetch('/__events')).json(), null, 2);
}
document.querySelector('#warm').onclick = async () => {
 await (await fetch('/lazy-v1.js', {cache: 'no-store'})).text();
 await (await fetch('/data-v1.json', {cache: 'no-store'})).text();
 result.textContent = 'Old chunk and data warmed'; await showEvents();
};
document.querySelector('#deploy').onclick = async () => {
 await fetch('/__deploy', {method: 'POST'});
 result.textContent = 'Deployment 2 active; this tab still runs version ${version}';
};
document.querySelector('#load').onclick = async () => {
 try {
  const chunk = await import('/lazy-v1.js');
  const data = await (await fetch('/data-v1.json', {cache: 'no-store'})).json();
  result.textContent = chunk.message + '; data version ' + data.version;
 } catch (error) { result.textContent = 'FAIL: ' + error.message; }
 await showEvents();
};
</script></html>`;
const assets = new Map([
	["index-v1", [document(1), "text/html"]],
	["index-v2", [document(2), "text/html"]],
	[
		"lazy-v1",
		['export const message = "Old SPA still works"', "application/javascript"],
	],
	["data-v1", ['{"version":1}', "application/json"]],
]);

export default {
	async fetch(request) {
		const path = new URL(request.url).pathname;

		if (path === "/__deploy" && request.method === "POST") {
			deployment = 2;

			return new Response("Deployment 2");
		}

		if (path === "/__events") {
			return Response.json(events);
		}

		const manifest = new Map([["/index.html", `index-v${deployment}`]]);

		if (deployment === 1) {
			manifest.set("/lazy-v1.js", "lazy-v1");
			manifest.set("/data-v1.json", "data-v1");
		}

		const metrics = {};
		const pending = [];
		const response = await generateHandler({
			request,
			metadata: { deploymentId: `spa-v${deployment}` },
			findAssetEntryForPath: async (pathname) => manifest.get(pathname) ?? null,
			getAssetKey: (entry) => entry,
			negotiateContent: () => ({ encoding: null }),
			fetchAsset: async (key) => {
				const [body, contentType] = assets.get(key);

				return { body: new Response(body).body, contentType };
			},
			logError: console.error,
			setMetrics: (value) => Object.assign(metrics, value),
			caches,
			waitUntil: (promise) => pending.push(promise),
		});
		// Make warming deterministic before the control endpoint switches manifests.
		await Promise.all(pending);
		events.push({
			path,
			deployment,
			mode: request.headers.get("sec-fetch-mode"),
			destination: request.headers.get("sec-fetch-dest"),
			status: response.status,
			...metrics,
		});

		return response;
	},
};
