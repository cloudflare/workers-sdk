import assert from "assert";
import fs from "fs/promises";
import http from "http";
import { AddressInfo } from "net";
import path from "path";
import test from "ava";
import Protocol from "devtools-protocol";
import esbuild from "esbuild";
import { DeferredPromise, Miniflare } from "miniflare";
import { RawSourceMap } from "source-map";
import { fetch } from "undici";
import NodeWebSocket from "ws";
import { escapeRegexp, useTmp } from "../../../test-shared";

const FIXTURES_PATH = path.resolve(
	__dirname,
	"..",
	"..",
	"..",
	"..",
	"..",
	"test",
	"fixtures",
	"source-maps"
);
const SERVICE_WORKER_ENTRY_PATH = path.join(FIXTURES_PATH, "service-worker.ts");
const MODULES_ENTRY_PATH = path.join(FIXTURES_PATH, "modules.ts");
const DEP_ENTRY_PATH = path.join(FIXTURES_PATH, "nested/dep.ts");
const REDUCE_PATH = path.join(FIXTURES_PATH, "reduce.ts");

test("source maps workers", async (t) => {
	// Build fixtures
	const tmp = await useTmp(t);
	await esbuild.build({
		entryPoints: [
			SERVICE_WORKER_ENTRY_PATH,
			MODULES_ENTRY_PATH,
			DEP_ENTRY_PATH,
		],
		format: "esm",
		bundle: true,
		sourcemap: true,
		outdir: tmp,
	});
	const serviceWorkerPath = path.join(tmp, "service-worker.js");
	const modulesPath = path.join(tmp, "modules.js");
	const depPath = path.join(tmp, "nested", "dep.js");
	const serviceWorkerContent = await fs.readFile(serviceWorkerPath, "utf8");
	const modulesContent = await fs.readFile(modulesPath, "utf8");

	// The OS should assign random ports in sequential order, meaning
	// `inspectorPort` is unlikely to be immediately chosen as a random port again
	const server = http.createServer();
	const inspectorPort = await new Promise<number>((resolve, reject) => {
		server.listen(0, () => {
			const port = (server.address() as AddressInfo).port;
			server.close((err) => (err ? reject(err) : resolve(port)));
		});
	});

	const mf = new Miniflare({
		inspectorPort,
		unsafeSourceMapIgnoreSourcePredicate(source) {
			return source.includes("nested/dep.ts");
		},
		workers: [
			{
				bindings: { MESSAGE: "unnamed" },
				scriptPath: serviceWorkerPath,
			},
			{
				name: "a",
				routes: ["*/a"],
				bindings: { MESSAGE: "a" },
				script: serviceWorkerContent,
				scriptPath: serviceWorkerPath,
			},
			{
				name: "b",
				routes: ["*/b"],
				modules: true,
				scriptPath: modulesPath,
				bindings: { MESSAGE: "b" },
			},
			{
				name: "c",
				routes: ["*/c"],
				bindings: { MESSAGE: "c" },
				modules: true,
				script: modulesContent,
				scriptPath: modulesPath,
			},
			{
				name: "d",
				routes: ["*/d"],
				bindings: { MESSAGE: "d" },
				modules: [{ type: "ESModule", path: modulesPath }],
			},
			{
				name: "e",
				routes: ["*/e"],
				bindings: { MESSAGE: "e" },
				modules: [
					{ type: "ESModule", path: modulesPath, contents: modulesContent },
				],
			},
			{
				name: "f",
				routes: ["*/f"],
				bindings: { MESSAGE: "f" },
				modulesRoot: tmp,
				modules: [{ type: "ESModule", path: modulesPath }],
			},
			{
				name: "g",
				routes: ["*/g"],
				modules: [
					// Check importing module with source map (e.g. Wrangler no bundle with built dependencies)
					{
						type: "ESModule",
						path: modulesPath,
						contents: `import { createErrorResponse } from "./nested/dep.js"; export default { fetch: createErrorResponse };`,
					},
					{ type: "ESModule", path: depPath },
				],
			},
			{
				name: "h",
				// Generated with `esbuild --sourcemap=inline --sources-content=false worker.ts`
				script: `"use strict";
addEventListener("fetch", (event) => {
  event.respondWith(new Response("body"));
});
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsid29ya2VyLnRzIl0sCiAgIm1hcHBpbmdzIjogIjtBQUFBLGlCQUFpQixTQUFTLENBQUMsVUFBVTtBQUNuQyxRQUFNLFlBQVksSUFBSSxTQUFTLE1BQU0sQ0FBQztBQUN4QyxDQUFDOyIsCiAgIm5hbWVzIjogW10KfQo=
`,
			},
		],
	});
	t.teardown(() => mf.dispose());

	// Check service-workers source mapped
	let error = await t.throwsAsync(mf.dispatchFetch("http://localhost"), {
		message: "unnamed",
	});
	const serviceWorkerEntryRegexp = escapeRegexp(
		`${SERVICE_WORKER_ENTRY_PATH}:6:17`
	);
	t.regex(String(error?.stack), serviceWorkerEntryRegexp);
	error = await t.throwsAsync(mf.dispatchFetch("http://localhost/a"), {
		message: "a",
	});
	t.regex(String(error?.stack), serviceWorkerEntryRegexp);

	// Check modules workers source mapped
	error = await t.throwsAsync(mf.dispatchFetch("http://localhost/b"), {
		message: "b",
	});
	const modulesEntryRegexp = escapeRegexp(`${MODULES_ENTRY_PATH}:5:19`);
	t.regex(String(error?.stack), modulesEntryRegexp);
	error = await t.throwsAsync(mf.dispatchFetch("http://localhost/c"), {
		message: "c",
	});
	t.regex(String(error?.stack), modulesEntryRegexp);
	error = await t.throwsAsync(mf.dispatchFetch("http://localhost/d"), {
		message: "d",
	});
	t.regex(String(error?.stack), modulesEntryRegexp);
	error = await t.throwsAsync(mf.dispatchFetch("http://localhost/e"), {
		message: "e",
	});
	t.regex(String(error?.stack), modulesEntryRegexp);
	error = await t.throwsAsync(mf.dispatchFetch("http://localhost/f"), {
		message: "f",
	});
	t.regex(String(error?.stack), modulesEntryRegexp);
	error = await t.throwsAsync(mf.dispatchFetch("http://localhost/g"), {
		instanceOf: TypeError,
		message: "Dependency error",
	});
	const nestedRegexp = escapeRegexp(`${DEP_ENTRY_PATH}:4:17`);
	t.regex(String(error?.stack), nestedRegexp);

	// Check source mapping URLs rewritten
	let sources = await getSources(inspectorPort, "core:user:");
	t.deepEqual(sources, [REDUCE_PATH, SERVICE_WORKER_ENTRY_PATH]);
	sources = await getSources(inspectorPort, "core:user:a");
	t.deepEqual(sources, [REDUCE_PATH, SERVICE_WORKER_ENTRY_PATH]);
	sources = await getSources(inspectorPort, "core:user:b");
	t.deepEqual(sources, [MODULES_ENTRY_PATH, REDUCE_PATH]);
	sources = await getSources(inspectorPort, "core:user:c");
	t.deepEqual(sources, [MODULES_ENTRY_PATH, REDUCE_PATH]);
	sources = await getSources(inspectorPort, "core:user:d");
	t.deepEqual(sources, [MODULES_ENTRY_PATH, REDUCE_PATH]);
	sources = await getSources(inspectorPort, "core:user:e");
	t.deepEqual(sources, [MODULES_ENTRY_PATH, REDUCE_PATH]);
	sources = await getSources(inspectorPort, "core:user:f");
	t.deepEqual(sources, [MODULES_ENTRY_PATH, REDUCE_PATH]);
	sources = await getSources(inspectorPort, "core:user:g");
	t.deepEqual(sources, [DEP_ENTRY_PATH, REDUCE_PATH]); // (entry point script overridden)

	// Check respects map's existing `sourceRoot`
	const sourceRoot = "a/b/c/d/e";
	const serviceWorkerMapPath = serviceWorkerPath + ".map";
	const serviceWorkerMap: RawSourceMap = JSON.parse(
		await fs.readFile(serviceWorkerMapPath, "utf8")
	);
	serviceWorkerMap.sourceRoot = sourceRoot;
	await fs.writeFile(serviceWorkerMapPath, JSON.stringify(serviceWorkerMap));
	t.deepEqual(await getSources(inspectorPort, "core:user:"), [
		path.resolve(tmp, sourceRoot, path.relative(tmp, REDUCE_PATH)),
		path.resolve(
			tmp,
			sourceRoot,
			path.relative(tmp, SERVICE_WORKER_ENTRY_PATH)
		),
	]);

	// Check does nothing with URL source mapping URLs
	const sourceMapURL = await getSourceMapURL(inspectorPort, "core:user:h");
	t.regex(sourceMapURL, /^data:application\/json;base64/);

	// Check adds ignored sources to `x_google_ignoreList`
	const sourceMap = await getSourceMap(inspectorPort, "core:user:g");
	assert(sourceMap.sourceRoot !== undefined);
	assert(sourceMap.x_google_ignoreList?.length === 1);
	const ignoredSource = sourceMap.sources[sourceMap.x_google_ignoreList[0]];
	t.is(path.resolve(sourceMap.sourceRoot, ignoredSource), DEP_ENTRY_PATH);
});

function getSourceMapURL(
	inspectorPort: number,
	serviceName: string
): Promise<string> {
	let sourceMapURL: string | undefined;
	const promise = new DeferredPromise<string>();
	const inspectorUrl = `ws://127.0.0.1:${inspectorPort}/${serviceName}`;
	const ws = new NodeWebSocket(inspectorUrl);
	ws.on("message", async (raw) => {
		try {
			const message = JSON.parse(raw.toString("utf8"));
			if (message.method === "Debugger.scriptParsed") {
				const params: Protocol.Debugger.ScriptParsedEvent = message.params;
				if (params.sourceMapURL === undefined || params.sourceMapURL === "") {
					return;
				}
				sourceMapURL = params.sourceMapURL;
				ws.close();
			}
		} catch (e) {
			promise.reject(e);
		}
	});
	ws.on("open", () => {
		ws.send(JSON.stringify({ id: 0, method: "Debugger.enable", params: {} }));
	});
	ws.on("close", () => {
		assert(sourceMapURL !== undefined, "Expected `sourceMapURL`");
		promise.resolve(sourceMapURL);
	});
	return promise;
}

async function getSourceMap(inspectorPort: number, serviceName: string) {
	const sourceMapURL = await getSourceMapURL(inspectorPort, serviceName);
	// The loopback server will be listening on `127.0.0.1`, which
	// `localhost` should resolve to, but `undici` only looks at the first
	// DNS entry, which will be `::1` on Node 17+.
	const res = await fetch(sourceMapURL.replace("localhost", "127.0.0.1"));
	return (await res.json()) as RawSourceMap & {
		x_google_ignoreList?: number[];
	};
}

async function getSources(inspectorPort: number, serviceName: string) {
	const { sourceRoot, sources } = await getSourceMap(
		inspectorPort,
		serviceName
	);
	assert(sourceRoot !== undefined);
	return sources.map((source) => path.resolve(sourceRoot, source)).sort();
}
