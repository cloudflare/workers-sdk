import { Readable } from "node:stream";
import { Request as MiniflareRequest } from "miniflare";
import type { RequestInit, Response as MiniflareResponse } from "miniflare";
import type * as http from "node:http";

export function toRequest(req: http.IncomingMessage): MiniflareRequest {
	const host = req.headers.host ?? "localhost";
	const protocol =
		(req.socket as { encrypted?: boolean }).encrypted === true
			? "https"
			: "http";
	const url = new URL(req.url ?? "/", `${protocol}://${host}`);
	const headers = new Headers();

	for (const [key, value] of Object.entries(req.headers)) {
		if (value === undefined) {
			continue;
		}
		if (Array.isArray(value)) {
			for (const item of value) {
				headers.append(key, item);
			}
		} else {
			headers.set(key, value);
		}
	}

	if (host && !headers.has("x-forwarded-host")) {
		headers.set("x-forwarded-host", host);
	}

	return new MiniflareRequest(url, {
		method: req.method,
		headers,
		body:
			req.method === "GET" || req.method === "HEAD"
				? undefined
				: (Readable.toWeb(req) as ReadableStream),
		duplex: "half",
	} as RequestInit & { duplex: "half" });
}

export async function writeResponse(
	res: http.ServerResponse,
	response: MiniflareResponse
): Promise<void> {
	res.statusCode = response.status;
	res.statusMessage = response.statusText;
	response.headers.forEach((value, key) => {
		res.setHeader(key, value);
	});

	if (!response.body) {
		res.end();
		return;
	}

	const body = Buffer.from(await response.arrayBuffer());
	res.end(body);
}
