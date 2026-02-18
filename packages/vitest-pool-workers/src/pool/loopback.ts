import assert from "node:assert";
import fs from "node:fs/promises";
import path from "node:path";
import { Response } from "miniflare";
import { isFileNotFoundError } from "./helpers";
import type { Awaitable, Miniflare, Request } from "miniflare";

// Based on https://github.com/vitest-dev/vitest/blob/v4.0.15/packages/snapshot/src/env/node.ts
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
	return new Response(null, { status: 404 });
}
