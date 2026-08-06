import assert from "node:assert";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import esbuild from "esbuild";
import { DeferredPromise, fetch, Log, LogLevel, Miniflare } from "miniflare";
import { test } from "vitest";
import NodeWebSocket from "ws";
import { singleModuleManifest, useDispose, useTmp } from "../../../test-shared";
import type Protocol from "devtools-protocol";
import type { RawSourceMap } from "source-map";

const FIXTURES_PATH = path.resolve(__dirname, "../../../fixtures/source-maps");
const SERVICE_WORKER_ENTRY_PATH = path.join(FIXTURES_PATH, "service-worker.ts");
const MODULES_ENTRY_PATH = path.join(FIXTURES_PATH, "modules.ts");
const DEP_ENTRY_PATH = path.join(FIXTURES_PATH, "nested/dep.ts");
const REDUCE_PATH = path.join(FIXTURES_PATH, "reduce.ts");
const INLINE_SOURCEMAP_WORKER_PATH = path.join(
	FIXTURES_PATH,
	"inline-sourcemap-worker.js"
);

export function escapeRegexpComponent(value: string): string {
	// From https://developer.mozilla.org/en-US/docs/Web/JavaScript/Guide/Regular_expressions#escaping
	return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function pathOrUrlRegexp(filePath: string): `(${string}|${string})` {
	return `(${escapeRegexpComponent(filePath)}|${escapeRegexpComponent(
		pathToFileURL(filePath).href
	)})`;
}

// Rewrite a source map's `sources` to absolute paths. esbuild emits `sources`
// relative to the map's on-disk location, but the new config format feeds the
// map inline as a `sourcemap`-type module whose name (and thus the resolved
// location workerd/source-map-support anchors to) is the CWD, not the build
// directory. Making `sources` absolute lets stack frames map back to the
// original fixtures regardless of where the map's name resolves to.
function withAbsoluteSources(
	mapContents: string,
	originalMapPath: string
): string {
	const map: RawSourceMap = JSON.parse(mapContents);
	const dir = path.dirname(originalMapPath);
	map.sources = map.sources.map((source) => path.resolve(dir, source));
	return JSON.stringify(map);
}

test("source maps workers", async ({ expect }) => {
	// Build fixtures
	const tmp = await useTmp();
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
	const modulesMapContent = await fs.readFile(modulesPath + ".map", "utf8");
	const depContent = await fs.readFile(depPath, "utf8");

	// Load the inline source map worker from an external file to prevent
	// Vite from stripping the sourceMappingURL comment during transformation.
	const inlineSourceMapWorkerContent = await fs.readFile(
		INLINE_SOURCEMAP_WORKER_PATH,
		"utf8"
	);

	const mf = new Miniflare({
		inspectorPort: 0,
		workers: [
			// Default service-worker with a co-located source map on disk.
			{
				config: {
					type: "worker",
					name: "",
					compatibilityDate: "2025-05-01",
					env: { MESSAGE: { type: "json", value: "unnamed" } },
				},
				legacy: {
					serviceWorkerScript: serviceWorkerContent,
					serviceWorkerScriptPath: serviceWorkerPath,
				},
			},
			{
				config: {
					type: "worker",
					name: "a",
					compatibilityDate: "2025-05-01",
					triggers: [{ type: "fetch", pattern: "*/a" }],
					env: { MESSAGE: { type: "json", value: "a" } },
				},
				legacy: {
					serviceWorkerScript: serviceWorkerContent,
					serviceWorkerScriptPath: serviceWorkerPath,
				},
			},
			// Module workers with co-located source maps on disk.
			{
				config: {
					type: "worker",
					name: "b",
					compatibilityDate: "2025-05-01",
					triggers: [{ type: "fetch", pattern: "*/b" }],
					env: { MESSAGE: { type: "json", value: "b" } },
					manifest: {
						mainModule: "modules.js",
						modulesRoot: tmp,
						modules: {
							"modules.js": { type: "esm", contents: modulesContent },
						},
					},
				},
				dev: { rootPath: tmp },
			},
			{
				config: {
					type: "worker",
					name: "c",
					compatibilityDate: "2025-05-01",
					triggers: [{ type: "fetch", pattern: "*/c" }],
					env: { MESSAGE: { type: "json", value: "c" } },
					manifest: {
						mainModule: "modules.js",
						modulesRoot: tmp,
						modules: {
							"modules.js": { type: "esm", contents: modulesContent },
						},
					},
				},
				dev: { rootPath: tmp },
			},
			// Module worker with a source map provided through the manifest (Wrangler style).
			{
				config: {
					type: "worker",
					name: "e",
					compatibilityDate: "2025-05-01",
					triggers: [{ type: "fetch", pattern: "*/e" }],
					env: { MESSAGE: { type: "json", value: "e" } },
					manifest: {
						mainModule: "modules.js",
						modulesRoot: tmp,
						modules: {
							"modules.js": { type: "esm", contents: modulesContent },
							"modules.js.map": {
								type: "sourcemap",
								contents: withAbsoluteSources(
									modulesMapContent,
									modulesPath + ".map"
								),
							},
						},
					},
				},
			},
			// Worker importing a nested dependency that carries its own source map
			// (e.g. Wrangler no-bundle with pre-built dependencies).
			{
				config: {
					type: "worker",
					name: "h",
					compatibilityDate: "2025-05-01",
					triggers: [{ type: "fetch", pattern: "*/h" }],
					manifest: {
						mainModule: "index.mjs",
						modulesRoot: tmp,
						modules: {
							"index.mjs": {
								type: "esm",
								contents: `import { createErrorResponse } from "./nested/dep.js"; export default { fetch: createErrorResponse };`,
							},
							"nested/dep.js": { type: "esm", contents: depContent },
						},
					},
				},
				dev: { rootPath: tmp },
			},
			// Worker with an inline `data:` source map, provided as a service-worker
			// script. These are preserved as-is (no rewriting).
			{
				config: {
					type: "worker",
					name: "i",
					compatibilityDate: "2025-05-01",
					triggers: [{ type: "fetch", pattern: "*/i" }],
				},
				legacy: { serviceWorkerScript: inlineSourceMapWorkerContent },
			},
		],
	});
	useDispose(mf);

	// Check service-workers are source mapped
	const serviceWorkerEntryRegexp = new RegExp(
		`${pathOrUrlRegexp(SERVICE_WORKER_ENTRY_PATH)}:6:16`
	);
	let error: Error | undefined;
	try {
		await mf.dispatchFetch("http://localhost");
	} catch (e) {
		error = e as Error;
	}
	expect(error?.message).toMatch("unnamed");
	expect(String(error?.stack)).toMatch(serviceWorkerEntryRegexp);

	try {
		await mf.dispatchFetch("http://localhost/a");
	} catch (e) {
		error = e as Error;
	}
	expect(error?.message).toMatch("a");
	expect(String(error?.stack)).toMatch(serviceWorkerEntryRegexp);

	// Check modules workers are source mapped
	const modulesEntryRegexp = new RegExp(
		`${pathOrUrlRegexp(MODULES_ENTRY_PATH)}:5:17`
	);
	try {
		await mf.dispatchFetch("http://localhost/b");
	} catch (e) {
		error = e as Error;
	}
	expect(error?.message).toMatch("b");
	expect(String(error?.stack)).toMatch(modulesEntryRegexp);

	try {
		await mf.dispatchFetch("http://localhost/c");
	} catch (e) {
		error = e as Error;
	}
	expect(error?.message).toMatch("c");
	expect(String(error?.stack)).toMatch(modulesEntryRegexp);

	try {
		await mf.dispatchFetch("http://localhost/e");
	} catch (e) {
		error = e as Error;
	}
	expect(error?.message).toMatch("e");
	expect(String(error?.stack)).toMatch(modulesEntryRegexp);

	// Check imported modules with their own source map are mapped
	try {
		await mf.dispatchFetch("http://localhost/h");
	} catch (e) {
		error = e as Error;
	}
	expect(error?.message).toMatch("Dependency error");
	const nestedRegexp = new RegExp(`${pathOrUrlRegexp(DEP_ENTRY_PATH)}:4:16`);
	expect(String(error?.stack)).toMatch(nestedRegexp);

	// Check source mapping URLs rewritten
	const inspectorBaseURL = await mf.getInspectorURL();
	let sources = await getSources(inspectorBaseURL, "core:user:");
	expect(sources).toEqual([REDUCE_PATH, SERVICE_WORKER_ENTRY_PATH]);
	sources = await getSources(inspectorBaseURL, "core:user:a");
	expect(sources).toEqual([REDUCE_PATH, SERVICE_WORKER_ENTRY_PATH]);
	sources = await getSources(inspectorBaseURL, "core:user:b");
	expect(sources).toEqual([MODULES_ENTRY_PATH, REDUCE_PATH]);
	sources = await getSources(inspectorBaseURL, "core:user:c");
	expect(sources).toEqual([MODULES_ENTRY_PATH, REDUCE_PATH]);
	sources = await getSources(inspectorBaseURL, "core:user:h");
	expect(sources).toEqual([DEP_ENTRY_PATH, REDUCE_PATH]); // (entry point script overridden)

	// Check respects map's existing `sourceRoot`
	const sourceRoot = "a/b/c/d/e";
	const serviceWorkerMapPath = serviceWorkerPath + ".map";
	const serviceWorkerMap: RawSourceMap = JSON.parse(
		await fs.readFile(serviceWorkerMapPath, "utf8")
	);
	serviceWorkerMap.sourceRoot = sourceRoot;
	await fs.writeFile(serviceWorkerMapPath, JSON.stringify(serviceWorkerMap));
	expect(await getSources(inspectorBaseURL, "core:user:")).toEqual([
		path.resolve(tmp, sourceRoot, path.relative(tmp, REDUCE_PATH)),
		path.resolve(
			tmp,
			sourceRoot,
			path.relative(tmp, SERVICE_WORKER_ENTRY_PATH)
		),
	]);

	// Check does nothing with URL source mapping URLs (i.e. inline data: URLs are preserved)
	const sourceMapURL = await getSourceMapURL(inspectorBaseURL, "core:user:i");
	expect(sourceMapURL).toMatch(/^data:application\/json;base64/);
});

function getSourceMapURL(
	inspectorBaseURL: URL,
	serviceName: string
): Promise<string> {
	let sourceMapURL: string | undefined;
	let settled = false;
	const promise = new DeferredPromise<string>();
	const inspectorURL = new URL(`/${serviceName}`, inspectorBaseURL);
	const ws = new NodeWebSocket(inspectorURL);

	const finish = (error?: Error) => {
		if (settled) return;
		settled = true;
		clearTimeout(timeout);
		if (error) {
			promise.reject(error);
		} else if (sourceMapURL !== undefined) {
			promise.resolve(sourceMapURL);
		} else {
			promise.reject(new Error("Expected `sourceMapURL` but WebSocket closed"));
		}
		try {
			ws.close();
		} catch {
			// Ignore close errors
		}
	};

	// Add timeout to prevent hanging forever
	const timeout = setTimeout(() => {
		finish(
			new Error(
				`Timed out waiting for sourceMapURL from inspector for ${serviceName}`
			)
		);
	}, 10_000);

	ws.on("message", async (raw) => {
		if (settled) return;
		try {
			const message = JSON.parse(raw.toString("utf8"));
			if (message.method === "Debugger.scriptParsed") {
				const params: Protocol.Debugger.ScriptParsedEvent = message.params;
				if (params.sourceMapURL === undefined || params.sourceMapURL === "") {
					return;
				}
				// If sourceMapURL is relative
				sourceMapURL = new URL(
					params.sourceMapURL,
					!params.url.startsWith("script-") ? params.url : undefined
				).toString();
				finish();
			}
		} catch (e) {
			finish(e instanceof Error ? e : new Error(String(e)));
		}
	});
	ws.on("open", () => {
		ws.send(JSON.stringify({ id: 0, method: "Debugger.enable", params: {} }));
	});
	ws.on("close", () => {
		finish();
	});
	ws.on("error", (err) => {
		finish(err instanceof Error ? err : new Error(String(err)));
	});
	return promise;
}

async function getSources(inspectorBaseURL: URL, serviceName: string) {
	const sourceMapURL = await getSourceMapURL(inspectorBaseURL, serviceName);
	assert(sourceMapURL.startsWith("file:"));
	const sourceMapPath = fileURLToPath(sourceMapURL);
	const sourceMapData = await fs.readFile(sourceMapPath, "utf8");
	const sourceMap: RawSourceMap = JSON.parse(sourceMapData);
	return sourceMap.sources
		.map((source) => {
			if (sourceMap.sourceRoot) {
				source = path.posix.join(sourceMap.sourceRoot, source);
			}
			return fileURLToPath(new URL(source, sourceMapURL));
		})
		.sort();
}

class CustomLog extends Log {
	logs: [LogLevel, string][] = [];

	log(message: string): void {
		this.logs.push([LogLevel.NONE, message]);
	}

	logWithLevel(level: LogLevel, message: string) {
		this.logs.push([level, message]);
	}

	getLogs(level: LogLevel): string[] {
		return this.logs
			.filter(([logLevel]) => logLevel === level)
			.map(([, message]) => message);
	}
}

test("responds with pretty error page", async ({ expect }) => {
	const log = new CustomLog();
	const mf = new Miniflare({
		log,
		workers: [
			{
				config: {
					type: "worker",
					name: "",
					compatibilityDate: "2025-05-01",
					// Old `modules: true` + inline `script` reported this module as
					// `script-0` in stack traces; preserve that name so the error
					// log assertion below matches.
					manifest: singleModuleManifest(
						`
		import { connect } from "cloudflare:sockets";

		// A function to test error thrown by native code
		async function connectSocket(request) {
			try {
				// The following line will throw an error because the port is invalid
				const socket = connect({ hostname: "gopher.floodgap.com", port: "invalid" });

				const writer = socket.writable.getWriter();
				const url = new URL(request.url);
				const encoder = new TextEncoder();
				const encoded = encoder.encode(url.pathname + "\\r\\n");
				await writer.write(encoded);
				await writer.close();

				return new Response(socket.readable, {
					headers: { "Content-Type": "text/plain" },
				});
			} catch (e) {
				throw new Error("Unusual oops!", {
					cause: e,
				});
			}
		}

		// This emulates the reduceError function in the Wrangler middleware template
		// See packages/wrangler/templates/middleware/middleware-miniflare3-json-error.ts
		function reduceError(e) {
			return {
				name: e?.name,
				message: e?.message ?? String(e),
				stack: e?.stack,
				cause: e?.cause === undefined ? undefined : reduceError(e.cause),
			};
		}

		export default {
			async fetch(request) {
				try {
					return await connectSocket(request);
				} catch (e) {
					const error = reduceError(e);
					return Response.json(error, {
						status: 500,
						headers: { "MF-Experimental-Error-Stack": "true" },
					});
				}
			},
		}`,
						{ mainModule: "script-0" }
					),
				},
			},
		],
	});
	useDispose(mf);
	const url = new URL("/some-unusual-path", await mf.ready);

	// Check `fetch()` returns pretty-error page...
	let res = await fetch(url, {
		method: "POST",
		headers: { "X-Unusual-Key": "some-unusual-value" },
	});
	expect(res.status).toBe(500);
	expect(res.headers.get("Content-Type") ?? "").toMatch(/^text\/html/);
	const text = await res.text();
	// ...including error, request method, URL and headers
	expect(text).toMatch(/Unusual oops!/);
	expect(text).toMatch(/Method.+POST/is);
	expect(text).toMatch(/URL.+some-unusual-path/is);
	expect(text).toMatch(/X-Unusual-Key.+some-unusual-value/is);
	// Check if the stack trace is included
	expect(text).toMatch(/cloudflare\:sockets/);
	expect(text).toMatch(/connectSocket/);
	expect(text).toMatch(/connect/);
	expect(text).toMatch(/Object\.fetch/);

	// Check error logged
	const errorLogs = log
		.getLogs(LogLevel.ERROR)
		.map((log) => log.replaceAll(/:\d+:\d+/g, ":N:N"));
	const scriptUrl = pathToFileURL(path.join(process.cwd(), "script-0")).href;
	expect(errorLogs).toEqual([
		`Error: Unusual oops!
    at connectSocket (${scriptUrl}:N:N)
    at Object.fetch (${scriptUrl}:N:N)
Caused by: TypeError: The value cannot be converted because it is not an integer.
    at connect (cloudflare:sockets:N:N)
    at connectSocket (${scriptUrl}:N:N)
    at Object.fetch (${scriptUrl}:N:N)`,
	]);

	// Check `fetch()` accepting HTML returns pretty-error page
	res = await fetch(url, { headers: { Accept: "text/html" } });
	expect(res.status).toBe(500);
	expect(res.headers.get("Content-Type") ?? "").toMatch(/^text\/html/);

	// Check `fetch()` accepting text doesn't return pretty-error page
	res = await fetch(url, { headers: { Accept: "text/plain" } });
	expect(res.status).toBe(500);
	expect(res.headers.get("Content-Type") ?? "").toMatch(/^text\/plain/);
	expect(await res.text()).toMatch(/Unusual oops!/);

	// Check `fetch()` as `curl` doesn't return pretty-error page
	res = await fetch(url, { headers: { "User-Agent": "curl/0.0.0" } });
	expect(res.status).toBe(500);
	expect(res.headers.get("Content-Type") ?? "").toMatch(/^text\/plain/);
	expect(await res.text()).toMatch(/Unusual oops!/);

	// Check `dispatchFetch()` propagates exception
	await expect(mf.dispatchFetch(url)).rejects.toThrow("Unusual oops!");
});

// This emulates a Worker bundled with the Wrangler json-error middleware
// See packages/wrangler/templates/middleware/middleware-miniflare3-json-error.ts
const JSON_ERROR_SCRIPT = `
function reduceError(e) {
	return {
		name: e?.name,
		message: e?.message ?? String(e),
		stack: e?.stack,
		cause: e?.cause === undefined ? undefined : reduceError(e.cause),
	};
}
export default {
	async fetch() {
		try {
			throw new Error("Unusual oops!");
		} catch (e) {
			const body = JSON.stringify(reduceError(e));
			return new Response(body, {
				status: 500,
				headers: {
					"Content-Type": "application/json",
					"MF-Experimental-Error-Stack": "true",
					"MF-Experimental-Error-Stack-Payload": encodeURIComponent(body),
				},
			});
		}
	},
}`;

test("invokes handleUncaughtError with the revived error", async ({
	expect,
}) => {
	const log = new CustomLog();
	const errors: Error[] = [];
	const mf = new Miniflare({
		log,
		handleUncaughtError(error) {
			errors.push(error);
		},
		workers: [
			{
				config: {
					type: "worker",
					name: "",
					compatibilityDate: "2025-05-01",
					manifest: singleModuleManifest(JSON_ERROR_SCRIPT),
				},
			},
		],
	});
	useDispose(mf);

	const res = await fetch(await mf.ready);
	expect(res.status).toBe(500);
	expect(errors.length).toBe(1);
	expect(errors[0]).toBeInstanceOf(Error);
	expect(errors[0].message).toBe("Unusual oops!");
	expect(errors[0].stack).toMatch(/Object\.fetch/);
});

// `workerd` drops response bodies for `HEAD` requests, so the serialised error
// cannot be recovered from the body alone — it is carried in a header too.
test("reports the revived error for HEAD requests", async ({ expect }) => {
	const log = new CustomLog();
	const errors: Error[] = [];
	const mf = new Miniflare({
		log,
		handleUncaughtError(error) {
			errors.push(error);
		},
		workers: [
			{
				config: {
					type: "worker",
					name: "",
					compatibilityDate: "2025-05-01",
					manifest: singleModuleManifest(JSON_ERROR_SCRIPT),
				},
			},
		],
	});
	useDispose(mf);

	const res = await fetch(await mf.ready, { method: "HEAD" });
	expect(res.status).toBe(500);
	expect(errors.length).toBe(1);
	expect(errors[0]).toBeInstanceOf(Error);
	expect(errors[0].message).toBe("Unusual oops!");
	expect(errors[0].stack).toMatch(/Object\.fetch/);
});

test("rejects HEAD dispatchFetch with the user error, not a parse error", async ({
	expect,
}) => {
	const mf = new Miniflare({
		workers: [
			{
				config: {
					type: "worker",
					name: "",
					compatibilityDate: "2025-05-01",
					manifest: singleModuleManifest(JSON_ERROR_SCRIPT),
				},
			},
		],
	});
	useDispose(mf);

	await expect(
		mf.dispatchFetch(await mf.ready, { method: "HEAD" })
	).rejects.toThrow("Unusual oops!");
});

// A stack too large to fit in a header is sent without the payload copy, so a
// `HEAD` request has no way to recover it. Reporting must still degrade to a
// plain error rather than leaking a JSON parse failure from miniflare.
const NO_PAYLOAD_HEADER_SCRIPT = `
export default {
	async fetch() {
		return new Response(JSON.stringify({ name: "Error", message: "Unusual oops!" }), {
			status: 500,
			headers: {
				"Content-Type": "application/json",
				"MF-Experimental-Error-Stack": "true",
			},
		});
	},
}`;

test("degrades without leaking a parse error when HEAD has no payload header", async ({
	expect,
}) => {
	const mf = new Miniflare({
		workers: [
			{
				config: {
					type: "worker",
					name: "",
					compatibilityDate: "2025-05-01",
					manifest: singleModuleManifest(NO_PAYLOAD_HEADER_SCRIPT),
				},
			},
		],
	});
	useDispose(mf);
	const url = await mf.ready;

	const res = await fetch(url, { method: "HEAD" });
	expect(res.status).toBe(500);

	await expect(mf.dispatchFetch(url, { method: "HEAD" })).rejects.toThrow(
		"Worker threw an uncaught exception"
	);

	// The GET path still recovers the error from the body
	await expect(mf.dispatchFetch(url)).rejects.toThrow("Unusual oops!");
});

// A stack frame may name a `file://` URL that `fileURLToPath` cannot convert
// to a local path. No single URL is invalid everywhere — a drive-less
// `file:///...` (every frame a POSIX-built bundle reports) throws on Windows
// but is fine on POSIX, while a non-local-host URL throws on POSIX but is a
// valid UNC path on Windows — so the stack carries one of each, and every
// platform's runner exercises the degradation through its own rejection.
const UNMAPPABLE_STACK_SCRIPT = `
export default {
	async fetch() {
		return Response.json(
			{
				name: "Error",
				message: "Unmappable oops!",
				stack: "Error: Unmappable oops!\\n    at fetch (file:///virtual/index.mjs:2:3)\\n    at reroute (file://not-local/index.mjs:1:1)",
			},
			{
				status: 500,
				headers: { "MF-Experimental-Error-Stack": "true" },
			}
		);
	},
}`;

test("still reports the error when a stack frame's file URL has no local path", async ({
	expect,
}) => {
	const log = new CustomLog();
	const errors: Error[] = [];
	const mf = new Miniflare({
		log,
		handleUncaughtError(error) {
			errors.push(error);
		},
		workers: [
			{
				config: {
					type: "worker",
					name: "",
					compatibilityDate: "2025-05-01",
					manifest: singleModuleManifest(UNMAPPABLE_STACK_SCRIPT),
				},
			},
		],
	});
	useDispose(mf);

	const res = await fetch(await mf.ready);
	expect(res.status).toBe(500);
	// The error response is still built from the revived error...
	expect(await res.text()).toMatch(/Unmappable oops!/);
	// ...the error is still logged...
	expect(log.getLogs(LogLevel.ERROR)[0]).toMatch(/Unmappable oops!/);
	// ...and the callback still fires, with both frames preserved un-mapped.
	expect(errors.length).toBe(1);
	expect(errors[0].message).toBe("Unmappable oops!");
	expect(errors[0].stack).toContain("file:///virtual/index.mjs");
	expect(errors[0].stack).toContain("file://not-local/index.mjs");
});

test("keeps building the error response when handleUncaughtError throws", async ({
	expect,
}) => {
	const log = new CustomLog();
	const mf = new Miniflare({
		log,
		handleUncaughtError() {
			throw new Error("Callback oops!");
		},
		workers: [
			{
				config: {
					type: "worker",
					name: "",
					compatibilityDate: "2025-05-01",
					manifest: singleModuleManifest(JSON_ERROR_SCRIPT),
				},
			},
		],
	});
	useDispose(mf);

	// The pretty-error page is still returned...
	const res = await fetch(await mf.ready, {
		headers: { Accept: "text/html" },
	});
	expect(res.status).toBe(500);
	expect(res.headers.get("Content-Type") ?? "").toMatch(/^text\/html/);
	expect(await res.text()).toMatch(/Unusual oops!/);

	// ...and the callback's own error is logged after the Worker error
	const errorLogs = log.getLogs(LogLevel.ERROR);
	expect(errorLogs[0]).toMatch(/Unusual oops!/);
	expect(errorLogs[1]).toMatch(/Callback oops!/);
});

test("absorbs a rejecting async handleUncaughtError callback", async ({
	expect,
}) => {
	const log = new CustomLog();
	const mf = new Miniflare({
		log,
		// An async callback is type-assignable to the void contract; its
		// rejection must be absorbed, not left to crash the process
		async handleUncaughtError() {
			throw new Error("Async callback oops!");
		},
		workers: [
			{
				config: {
					type: "worker",
					name: "",
					compatibilityDate: "2025-05-01",
					manifest: singleModuleManifest(JSON_ERROR_SCRIPT),
				},
			},
		],
	});
	useDispose(mf);

	const res = await fetch(await mf.ready);
	expect(res.status).toBe(500);
	expect(await res.text()).toMatch(/Unusual oops!/);

	// The rejection is absorbed into the log, not left unhandled (an
	// unhandled rejection would also fail the test file under vitest)
	await new Promise((resolve) => setTimeout(resolve, 10));
	const errorLogs = log.getLogs(LogLevel.ERROR);
	expect(errorLogs[0]).toMatch(/Unusual oops!/);
	expect(errorLogs[1]).toMatch(/Async callback oops!/);
});
