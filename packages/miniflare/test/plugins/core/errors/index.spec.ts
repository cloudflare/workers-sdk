import assert from "node:assert";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import Protocol from "devtools-protocol";
import esbuild from "esbuild";
import { DeferredPromise, fetch, Log, LogLevel, Miniflare } from "miniflare";
import { expect, test } from "vitest";
import NodeWebSocket from "ws";
import { useDispose, useTmp } from "../../../test-shared";
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

test("source maps workers", async () => {
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

	// Load the inline source map worker from an external file to prevent
	// Vite from stripping the sourceMappingURL comment during transformation.
	const inlineSourceMapWorkerContent = await fs.readFile(
		INLINE_SOURCEMAP_WORKER_PATH,
		"utf8"
	);

	const mf = new Miniflare({
		inspectorPort: 0,
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
				bindings: { MESSAGE: "g" },
				modules: true,
				modulesRoot: tmp,
				scriptPath: modulesPath,
			},
			{
				name: "h",
				routes: ["*/h"],
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
				name: "i",
				routes: ["*/i"],
				// Worker with inline source map loaded from external file
				script: inlineSourceMapWorkerContent,
			},
		],
	});
	useDispose(mf);

	// Check service-workers source mapped
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

	// Check modules workers source mapped
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
		await mf.dispatchFetch("http://localhost/d");
	} catch (e) {
		error = e as Error;
	}
	expect(error?.message).toMatch("d");
	expect(String(error?.stack)).toMatch(modulesEntryRegexp);

	try {
		await mf.dispatchFetch("http://localhost/e");
	} catch (e) {
		error = e as Error;
	}
	expect(error?.message).toMatch("e");
	expect(String(error?.stack)).toMatch(modulesEntryRegexp);

	try {
		await mf.dispatchFetch("http://localhost/f");
	} catch (e) {
		error = e as Error;
	}
	expect(error?.message).toMatch("f");
	expect(String(error?.stack)).toMatch(modulesEntryRegexp);

	try {
		await mf.dispatchFetch("http://localhost/g");
	} catch (e) {
		error = e as Error;
	}
	expect(error?.message).toMatch("g");
	expect(String(error?.stack)).toMatch(modulesEntryRegexp);

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
	sources = await getSources(inspectorBaseURL, "core:user:d");
	expect(sources).toEqual([MODULES_ENTRY_PATH, REDUCE_PATH]);
	sources = await getSources(inspectorBaseURL, "core:user:e");
	expect(sources).toEqual([MODULES_ENTRY_PATH, REDUCE_PATH]);
	sources = await getSources(inspectorBaseURL, "core:user:f");
	expect(sources).toEqual([MODULES_ENTRY_PATH, REDUCE_PATH]);
	sources = await getSources(inspectorBaseURL, "core:user:g");
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

test("responds with pretty error page", async () => {
	const log = new CustomLog();
	const mf = new Miniflare({
		log,
		modules: true,
		script: `
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
	expect(errorLogs).toEqual([
		`Error: Unusual oops!
    at connectSocket (script-0:N:N)
    at Object.fetch (script-0:N:N)
Caused by: TypeError: The value cannot be converted because it is not an integer.
    at connect (cloudflare:sockets:N:N)
    at connectSocket (script-0:N:N)
    at Object.fetch (script-0:N:N)`,
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
