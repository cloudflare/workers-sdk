import assert from "node:assert";
import nodeFs from "node:fs";
import fs from "node:fs/promises";
import nodeModule from "node:module";
import path from "node:path";
import { Response } from "miniflare";
import { isFileNotFoundError } from "./helpers";
import type { Awaitable, Miniflare, Request } from "miniflare";

// Inlined from @vitest/mocker/redirect — we can't import it because pnpm
// doesn't hoist it to a location resolvable from our dist output.
function findMockRedirect(
	root: string,
	mockPath: string,
	external: string | null
): string | null {
	const p = external || mockPath;

	if (external || nodeModule.isBuiltin(mockPath) || !nodeFs.existsSync(mockPath)) {
		const mockDirname = path.dirname(p);
		const mockFolder = path.join(root, "__mocks__", mockDirname);
		if (!nodeFs.existsSync(mockFolder)) {
			return null;
		}
		const baseOriginal = path.basename(p);
		return findFile(mockFolder, baseOriginal);
	}

	const dir = path.dirname(p);
	const baseId = path.basename(p);
	const fullPath = path.resolve(dir, "__mocks__", baseId);
	return nodeFs.existsSync(fullPath) ? fullPath : null;
}

function findFile(mockFolder: string, baseOriginal: string): string | null {
	const files = nodeFs.readdirSync(mockFolder);
	for (const file of files) {
		const baseFile = path.basename(file, path.extname(file));
		if (baseFile === baseOriginal) {
			const filePath = path.resolve(mockFolder, file);
			if (nodeFs.statSync(filePath).isFile()) {
				return filePath;
			}
			const indexFile = findFile(filePath, "index");
			if (indexFile) {
				return indexFile;
			}
		}
	}
	return null;
}

// Based on https://github.com/vitest-dev/vitest/blob/v4.0.18/packages/snapshot/src/env/node.ts
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
		await fs.mkdir(path.dirname(filePath), { recursive: true });
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

export async function listDurableObjectIds(
	request: Request,
	mf: Miniflare,
	url: URL
): Promise<Response> {
	if (request.method !== "GET") {
		return new Response(null, { status: 405 });
	}
	const persistPaths = mf.unsafeGetPersistPaths();
	const durableObjectPersistPath = persistPaths.get("do");
	assert(
		durableObjectPersistPath !== undefined,
		"Expected Durable Object persist path"
	);

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

function handleMockRedirectRequest(url: URL): Response {
	const root = url.searchParams.get("root");
	const mockPath = url.searchParams.get("mockPath");
	const external = url.searchParams.get("external");
	if (root === null || mockPath === null) {
		return new Response(null, { status: 400 });
	}
	const redirect = findMockRedirect(root, mockPath, external);
	if (redirect === null) {
		return new Response(null, { status: 404 });
	}
	return new Response(redirect, { status: 200 });
}

export function handleLoopbackRequest(
	request: Request,
	mf: Miniflare
): Awaitable<Response> {
	const url = new URL(request.url);
	if (url.pathname === "/snapshot") {
		return handleSnapshotRequest(request, url);
	}
	if (url.pathname === "/durable-objects") {
		return listDurableObjectIds(request, mf, url);
	}
	if (url.pathname === "/mock-redirect") {
		return handleMockRedirectRequest(url);
	}
	return new Response(null, { status: 404 });
}
