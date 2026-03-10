import assert from "node:assert";
import { opendirSync, rmSync } from "node:fs";
import fs from "node:fs/promises";
import path from "node:path";
import {
	CACHE_PLUGIN_NAME,
	D1_PLUGIN_NAME,
	DURABLE_OBJECTS_PLUGIN_NAME,
	KV_PLUGIN_NAME,
	Mutex,
	R2_PLUGIN_NAME,
	Response,
	WORKFLOWS_PLUGIN_NAME,
} from "miniflare";
import { isFileNotFoundError, WORKER_NAME_PREFIX } from "./helpers";
import type { Awaitable, Miniflare, Request, WorkerOptions } from "miniflare";

// Based on https://github.com/vitest-dev/vitest/blob/v1.0.0-beta.5/packages/snapshot/src/env/node.ts
async function handleSnapshotRequest(
	request: Request,
	url: URL
): Promise<Response> {
	const filePath = url.searchParams.get("path");
	if (filePath === null) {
		return new Response(null, { status: 400 });
	}

	if (request.method === "POST" /* prepareDirectory */) {
		await fs.mkdir(filePath, { recursive: true });
		return new Response(null, { status: 204 });
	}

	if (request.method === "PUT" /* saveSnapshotFile */) {
		const snapshot = await request.arrayBuffer();
		await fs.mkdir(path.posix.dirname(filePath), { recursive: true });
		await fs.writeFile(filePath, new Uint8Array(snapshot));
		return new Response(null, { status: 204 });
	}

	if (request.method === "GET" /* readSnapshotFile */) {
		try {
			return new Response(await fs.readFile(filePath));
		} catch (e) {
			if (!isFileNotFoundError(e)) {
				throw e;
			}
			return new Response(null, { status: 404 });
		}
	}

	if (request.method === "DELETE" /* removeSnapshotFile */) {
		try {
			await fs.unlink(filePath);
		} catch (e) {
			if (!isFileNotFoundError(e)) {
				throw e;
			}
		}
		return new Response(null, { status: 204 });
	}

	return new Response(null, { status: 405 });
}

function emptyDir(dirPath: string) {
	let dir;
	try {
		dir = opendirSync(dirPath);
	} catch (e) {
		if (isFileNotFoundError(e)) {
			return;
		}
		throw e;
	}
	try {
		let entry;
		while ((entry = dir.readSync()) !== null) {
			const fullPath = path.join(dirPath, entry.name);

			if (entry.isDirectory()) {
				emptyDir(fullPath);
			} else {
				try {
					rmSync(fullPath, { force: true });
				} catch (e) {
					if (isEbusyError(e)) {
						console.warn(`vitest-pool-worker: Unable to remove file: ${e}`);
					}
				}
			}
		}
	} finally {
		dir.closeSync();
	}
}

function isEbusyError(e: unknown): boolean {
	return e instanceof Error && "code" in e && e.code === "EBUSY";
}

/**
 * ## Stacked/Isolated Storage System
 *
 * One of the features of `@cloudflare/vitest-pool-workers` is isolated per-test
 * storage. If enabled, writes performed in a test are undone at the end of that
 * test. Writes performed in `beforeAll()` hooks are not undone. As an example,
 * this is the behaviour we're describing:
 *
 * ```js
 * async function get() { return (await env.TEST_NAMESPACE.get("key")) ?? ""; }
 * async function append(str) { await env.TEST_NAMESPACE.put("key", get() + str); }
 *
 * beforeAll(() => append("a"));
 * beforeEach(() => append("b"));
 *
 * test("test 1", async () => {
 *   await append("c");
 *   expect(await get()).toBe("abc");
 * });
 * test("test 2", async () => {
 *   await append("d");
 *   expect(await get()).toBe("abd"); // append("c") undone
 * });
 *
 * describe("nested", () => {
 *   beforeAll(() => append("e"));
 *   beforeEach(() => append("f"));
 *
 *   test("test 3", async () => {
 *     await append("g");
 *     expect(await get()).toBe("aebfg"); // all `beforeAll()`s first
 *   });
 *   test("test 4", async () => {
 *     await append("h");
 *     expect(await get()).toBe("aebfh");
 *   });
 * });
 * ```
 *
 * Each `Miniflare` instance in the pool has its own directory for persistent
 * state. If we wanted to update this mid-state, we'd need to restart the
 * corresponding `workerd` instance, as the persistence path is encoded in a
 * `diskDirectory` service.
 *
 * Instead, we implement this with an on-disk "stack" containing "backups" of
 * the `.sqlite` files belonging to Miniflare's Durable Objects. Whenever Vitest
 * starts a test attempt or enters a describe block, we "push" (copy) the
 * current `.sqlite` files into the stack. Whenever Vitest finishes a test
 * attempt or leaves a describe block, we "pop" (copy) the `.sqlite` files from
 * the top of the stack to the persistence path.
 *
 * Notably, we don't copy the blobs referenced by the `.sqlite` databases.
 * Instead, we enable Miniflare's "sticky" blobs feature which prevents blobs
 * being garbage collected when they're no longer referenced. This means that if
 * a user deletes or overwrites a value, the old value's blob will still be
 * stored, meaning when we "pop" the stack, the blob references will be valid.
 * At the end of a test run, we will empty the persistence directories, cleaning
 * up all blobs.
 */
interface StackedStorageState {
	// Only one stack operation per Miniflare instance may be in-progress at a
	// given time
	mutex: Mutex;
	// Current size of the stack
	depth: number;
	// If we failed to push/pop stacks for any reason, mark the state as broken.
	// In this case, any future operation will fail.
	broken: boolean;
	// All of our persistence paths will be using `Miniflare`'s temporary directory
	// which is generated once when calling `new Miniflare()`. We never change any
	// `*Persist` settings in `setOptions()` calls, so persistence paths for a given
	// `Miniflare` instance will always be the same.
	persistPaths: string[]; // (unique)
	// We need this one specifically for listing Durable Object IDs.
	durableObjectPersistPath: string;
	// `Promise` that will resolve when the background persistence directory
	// cleanup completes. We do this in the background at the end of tests as
	// opposed to before tests start, so re-runs start quickly, and results are
	// displayed as soon as they're ready. `waitForStorageReset(mf)` should be
	// called before using `mf` for a new test run.
	storageResetPromise?: Promise<void>;
}
const stackStates = new WeakMap<Miniflare, StackedStorageState>();
function getState(mf: Miniflare) {
	let state = stackStates.get(mf);
	if (state === undefined) {
		const persistPaths = mf.unsafeGetPersistPaths();
		const durableObjectPersistPath = persistPaths.get("do");
		assert(
			durableObjectPersistPath !== undefined,
			"Expected Durable Object persist path"
		);
		state = {
			mutex: new Mutex(),
			depth: 0,
			broken: false,
			persistPaths: Array.from(new Set(persistPaths.values())),
			durableObjectPersistPath,
		};
		stackStates.set(mf, state);
	}
	return state;
}

const ABORT_ALL_WORKER_NAME = `${WORKER_NAME_PREFIX}abort-all`;
// The `abortAllDurableObjects()` API is only accessible from a worker, so we
// add this extra worker to all `Miniflare` instances constructed by the pool,
// so we can this function from Node.
export const ABORT_ALL_WORKER: WorkerOptions = {
	name: ABORT_ALL_WORKER_NAME,
	compatibilityFlags: ["unsafe_module"],
	modules: [
		{
			type: "ESModule",
			path: "index.mjs",
			contents: `
			import workerdUnsafe from "workerd:unsafe";
			export default {
				async fetch(request) {
					if (request.method !== "DELETE") return new Response(null, { status: 405 });
					await workerdUnsafe.abortAllDurableObjects();
					return new Response(null, { status: 204 });
				}
			};
			`,
		},
	],
};
export function scheduleStorageReset(mf: Miniflare) {
	const state = getState(mf);
	assert(state.storageResetPromise === undefined);
	state.storageResetPromise = state.mutex.runWith(async () => {
		const abortAllWorker = await mf.getWorker(ABORT_ALL_WORKER_NAME);
		await abortAllWorker.fetch("http://placeholder", { method: "DELETE" });
		for (const persistPath of state.persistPaths) {
			// Clear directory rather than removing it so `workerd` can retain handle
			emptyDir(persistPath);
		}
		state.depth = 0;
		// If any of the code in this callback throws, the `storageResetPromise`
		// won't be reset, and `await`ing it will throw the error. This is what we
		// want, as failing to clean up means the persistence directory is in an
		// invalid state.
		state.storageResetPromise = undefined;
	});
}
export async function waitForStorageReset(mf: Miniflare): Promise<void> {
	await getState(mf).storageResetPromise;
}

const BLOBS_DIR_NAME = "blobs";
const STACK_DIR_NAME = "__vitest_pool_workers_stack";
async function pushStackedStorage(intoDepth: number, persistPath: string) {
	// Create directory for new stack frame
	const stackFramePath = path.join(
		persistPath,
		STACK_DIR_NAME,
		intoDepth.toString()
	);
	await fs.mkdir(stackFramePath, { recursive: true });

	// For each Durable Object unique key in the persistence path...
	for (const key of await fs.readdir(persistPath, { withFileTypes: true })) {
		// (skipping stack directory)
		if (key.name === STACK_DIR_NAME) {
			continue;
		}
		const keyPath = path.join(persistPath, key.name);
		const stackFrameKeyPath = path.join(stackFramePath, key.name);
		assert(key.isDirectory(), `Expected ${keyPath} to be a directory`);
		// ...copy all `.sqlite` files to the stack frame
		let createdStackFrameKeyPath = false;
		for (const name of await fs.readdir(keyPath)) {
			// If this is a blobs directory, it shouldn't contain any `.sqlite` files
			if (name === BLOBS_DIR_NAME) {
				break;
			}
			if (!createdStackFrameKeyPath) {
				createdStackFrameKeyPath = true;
				await fs.mkdir(stackFrameKeyPath);
			}
			const namePath = path.join(keyPath, name);
			const stackFrameNamePath = path.join(stackFrameKeyPath, name);
			assert(name.endsWith(".sqlite"), `Expected .sqlite, got ${namePath}`);
			await fs.copyFile(namePath, stackFrameNamePath);
		}
	}
}
async function popStackedStorage(fromDepth: number, persistPath: string) {
	// Delete every Durable Object unique key directory in the persistence path
	for (const key of await fs.readdir(persistPath, { withFileTypes: true })) {
		// (skipping stack directory)
		if (key.name === STACK_DIR_NAME) {
			continue;
		}
		const keyPath = path.join(persistPath, key.name);
		for (const name of await fs.readdir(keyPath)) {
			// If this is a blobs directory, it shouldn't contain any `.sqlite` files
			if (name === BLOBS_DIR_NAME) {
				break;
			}
			const namePath = path.join(keyPath, name);
			assert(name.endsWith(".sqlite"), `Expected .sqlite, got ${namePath}`);

			await fs.unlink(namePath);
		}
	}

	// Copy the stack frame into the persistent path
	const stackFramePath = path.join(
		persistPath,
		STACK_DIR_NAME,
		fromDepth.toString()
	);
	await fs.cp(stackFramePath, persistPath, { recursive: true });

	// Remove the stack frame.
	//
	// Note: this is intentionally inlined rather than importing `removeDir` from
	// `@cloudflare/workers-utils`. That package's barrel export pulls in CJS
	// dependencies (e.g. `xdg-app-paths`) that break when esbuild bundles them
	// into our ESM output — the shimmed `require()` calls throw
	// "Dynamic require of 'path' is not supported" at runtime.
	// If the bundling setup for this package changes in the future (e.g.
	// tree-shaking improves or a sub-path export is added), this could be
	// replaced with a direct import from `@cloudflare/workers-utils`.
	// Keep aligned with `removeDir()` in `packages/workers-utils/src/fs-helpers.ts`.
	// eslint-disable-next-line workers-sdk/no-direct-recursive-rm -- see comment above: barrel import breaks ESM bundle
	await fs.rm(stackFramePath, {
		recursive: true,
		force: true,
		maxRetries: 5,
		retryDelay: 100,
	});
}

const PLUGIN_PRODUCT_NAMES: Record<string, string | undefined> = {
	[CACHE_PLUGIN_NAME]: "Cache",
	[D1_PLUGIN_NAME]: "D1",
	[DURABLE_OBJECTS_PLUGIN_NAME]: "Durable Objects",
	[KV_PLUGIN_NAME]: "KV",
	[R2_PLUGIN_NAME]: "R2",
	[WORKFLOWS_PLUGIN_NAME]: "Workflows",
};
const LIST_FORMAT = new Intl.ListFormat("en-US");

function checkAllStorageOperationsResolved(
	action: "push" | "pop",
	source: string,
	persistPaths: string[],
	results: PromiseSettledResult<void>[]
): boolean {
	const failedProducts: string[] = [];
	const lines: string[] = [];
	for (let i = 0; i < results.length; i++) {
		const result = results[i];
		if (result.status === "rejected") {
			const pluginName = path.basename(persistPaths[i]);
			const productName = PLUGIN_PRODUCT_NAMES[pluginName] ?? pluginName;
			failedProducts.push(productName);
			lines.push(`- ${result.reason}`);
		}
	}
	if (failedProducts.length > 0) {
		const separator = "=".repeat(80);
		lines.unshift(
			"",
			separator,
			`Failed to ${action} isolated storage stack frame in ${source}.`,
			`In particular, we were unable to ${action} ${LIST_FORMAT.format(failedProducts)} storage.`,
			"This usually means your Worker tried to access storage outside of a test, or some resources have not been disposed of properly.",
			`Ensure you "await" all Promises that read or write to these services, and make sure you use the "using" keyword when passing data across JSRPC.`,
			`See https://developers.cloudflare.com/workers/testing/vitest-integration/known-issues/#isolated-storage for more details.`,
			"\x1b[2m"
		);
		lines.push("\x1b[22m" + separator, "");

		if (
			failedProducts.includes(
				PLUGIN_PRODUCT_NAMES[WORKFLOWS_PLUGIN_NAME] ?? WORKFLOWS_PLUGIN_NAME
			)
		) {
			console.warn(
				[
					"",
					separator,
					`Workflows are being created in ${source}.`,
					"Even with isolated storage, Workflows are required to be manually disposed at the end of each test.",
					"See https://developers.cloudflare.com/workers/testing/vitest-integration/test-apis/ for more details.",
					"",
				].join("\n")
			);
		}
		console.error(lines.join("\n"));
		return false;
	}
	return true;
}

async function handleStorageRequest(
	request: Request,
	mf: Miniflare
): Promise<Response> {
	const state = getState(mf);
	if (state.broken) {
		return new Response(
			"Isolated storage failed. There should be additional logs above.",
			{ status: 500 }
		);
	}

	// Assuming all Durable Objects have been aborted at this point, so we can
	// copy/delete `.sqlite` files as required

	const source =
		request.headers.get("MF-Vitest-Source") ?? "an unknown location";

	let success: boolean;
	if (request.method === "POST" /* push */) {
		success = await state.mutex.runWith(async () => {
			state.depth++;
			const results = await Promise.allSettled(
				state.persistPaths.map((persistPath) =>
					pushStackedStorage(state.depth, persistPath)
				)
			);
			return checkAllStorageOperationsResolved(
				"push",
				source,
				state.persistPaths,
				results
			);
		});
	} else if (request.method === "DELETE" /* pop */) {
		success = await state.mutex.runWith(async () => {
			assert(state.depth > 0, "Stack underflow");
			const results = await Promise.allSettled(
				state.persistPaths.map((persistPath) =>
					popStackedStorage(state.depth, persistPath)
				)
			);
			state.depth--;
			return checkAllStorageOperationsResolved(
				"pop",
				source,
				state.persistPaths,
				results
			);
		});
	} else {
		return new Response(null, { status: 405 });
	}

	if (success) {
		return new Response(null, { status: 204 });
	} else {
		state.broken = true;
		return new Response(
			"Isolated storage failed. There should be additional logs above.",
			{ status: 500 }
		);
	}
}

export async function handleDurableObjectsRequest(
	request: Request,
	mf: Miniflare,
	url: URL
): Promise<Response> {
	if (request.method !== "GET") {
		return new Response(null, { status: 405 });
	}
	const { durableObjectPersistPath } = getState(mf);
	const uniqueKey = url.searchParams.get("unique_key");
	if (uniqueKey === null) {
		return new Response(null, { status: 400 });
	}
	const namespacePath = path.join(durableObjectPersistPath, uniqueKey);

	const ids: string[] = [];
	try {
		const names = await fs.readdir(namespacePath);
		for (const name of names) {
			if (name.endsWith(".sqlite")) {
				ids.push(name.substring(0, name.length - 7 /* ".sqlite".length */));
			}
		}
	} catch (e) {
		if (!isFileNotFoundError(e)) {
			throw e;
		}
	}
	return Response.json(ids);
}

export function handleLoopbackRequest(
	request: Request,
	mf: Miniflare
): Awaitable<Response> {
	const url = new URL(request.url);
	if (url.pathname === "/snapshot") {
		return handleSnapshotRequest(request, url);
	}
	if (url.pathname === "/storage") {
		return handleStorageRequest(request, mf);
	}
	if (url.pathname === "/durable-objects") {
		return handleDurableObjectsRequest(request, mf, url);
	}
	return new Response(null, { status: 404 });
}
