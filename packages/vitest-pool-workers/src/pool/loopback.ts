import fs from "node:fs/promises";
import path from "node:path";
import { Response } from "miniflare";
import { isFileNotFoundError } from "./helpers";
import type { Awaitable, Request } from "miniflare";

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

export function handleLoopbackRequest(request: Request): Awaitable<Response> {
	const url = new URL(request.url);
	if (url.pathname === "/snapshot") return handleSnapshotRequest(request, url);
	return new Response(null, { status: 404 });
}
