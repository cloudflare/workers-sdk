import assert from "node:assert";
import fs from "node:fs/promises";
import path from "node:path";
import { Mutex, Response } from "miniflare";
import { isFileNotFoundError } from "./helpers";
import type { Awaitable, Miniflare, Request } from "miniflare";

// Based on https://github.com/vitest-dev/vitest/blob/v1.0.0-beta.5/packages/snapshot/src/env/node.ts
async function handleSnapshotRequest(
	request: Request,
	url: URL
): Promise<Response> {
	const filePath = url.searchParams.get("path");
	if (filePath === null) return new Response(null, { status: 400 });

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
			if (!isFileNotFoundError(e)) throw e;
			return new Response(null, { status: 404 });
		}
	}

	if (request.method === "DELETE" /* removeSnapshotFile */) {
		try {
			await fs.unlink(filePath);
		} catch (e) {
			if (!isFileNotFoundError(e)) throw e;
		}
		return new Response(null, { status: 204 });
	}

	return new Response(null, { status: 405 });
}

interface StackedStorageState {
	// Only one stack operation per instance may be in-progress at a given time
	mutex: Mutex;
	// Current size of the stack
	depth: number;
	// All of our persistence paths will be using `Miniflare`'s temporary directory
	// which is generated once when calling `new Miniflare()`. We never change any
	// `*Persist` settings in `setOptions()` calls, so persistence paths for a given
	// `Miniflare` instance will always be the same.
	persistPaths: string[]; // (unique)
}
const stackStates = new WeakMap<Miniflare, StackedStorageState>();

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
		if (key.name === STACK_DIR_NAME) continue;
		const keyPath = path.join(persistPath, key.name);
		const stackFrameKeyPath = path.join(stackFramePath, key.name);
		assert(key.isDirectory(), `Expected ${keyPath} to be a directory`);
		// ...copy all `.sqlite` files to the stack frame
		let createdStackFrameKeyPath = false;
		for (const name of await fs.readdir(keyPath)) {
			// If this is a blobs directory, it shouldn't contain any `.sqlite` files
			if (name === BLOBS_DIR_NAME) break;
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
		if (key.name === STACK_DIR_NAME) continue;
		const keyPath = path.join(persistPath, key.name);
		for (const name of await fs.readdir(keyPath)) {
			// If this is a blobs directory, it shouldn't contain any `.sqlite` files
			if (name === BLOBS_DIR_NAME) break;
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

	// Remove the stack frame
	await fs.rm(stackFramePath, { recursive: true, force: true });
}

async function handleStorageRequest(
	mf: Miniflare,
	request: Request
): Promise<Response> {
	let maybeState = stackStates.get(mf);
	if (maybeState === undefined) {
		maybeState = {
			mutex: new Mutex(),
			depth: 0,
			persistPaths: Array.from(mf.unsafeGetPersistPaths()),
		};
		stackStates.set(mf, maybeState);
	}
	const state = maybeState;

	// Assuming all Durable Objects have been aborted at this point, so we can
	// copy/delete `.sqlite` files as required

	if (request.method === "POST" /* push */) {
		await maybeState.mutex.runWith(async () => {
			state.depth++;
			await Promise.all(
				state.persistPaths.map((persistPath) =>
					pushStackedStorage(state.depth, persistPath)
				)
			);
		});
		return new Response(null, { status: 204 });
	}

	if (request.method === "DELETE" /* pop */) {
		await maybeState.mutex.runWith(async () => {
			assert(state.depth > 0, "Stack underflow");
			await Promise.all(
				state.persistPaths.map((persistPath) =>
					popStackedStorage(state.depth, persistPath)
				)
			);
			state.depth--;
		});
		return new Response(null, { status: 204 });
	}

	return new Response(null, { status: 405 });
}

export function handleLoopbackRequest(
	this: Miniflare,
	request: Request
): Awaitable<Response> {
	const url = new URL(request.url);
	if (url.pathname === "/snapshot") return handleSnapshotRequest(request, url);
	if (url.pathname === "/storage") return handleStorageRequest(this, request);
	return new Response(null, { status: 404 });
}
