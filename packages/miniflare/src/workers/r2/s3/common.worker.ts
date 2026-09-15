import { Buffer } from "node:buffer";
import { XMLBuilder, XMLParser } from "fast-xml-parser";
import type { R2S3Bindings, S3Credentials } from "../constants";
import type { Context } from "hono";

export interface Env {
	[R2S3Bindings.JSON_CREDENTIALS]: Record<string, S3Credentials>;
	[bucket: `${typeof R2S3Bindings.BUCKET_PREFIX}${string}`]:
		| R2Bucket
		| undefined;
}

export type S3Context = Context<{ Bindings: Env }>;

/** HEAD responses must not include a body */
export function stripBodyForHead(c: S3Context, response: Response): Response {
	return c.req.method === "HEAD" && response.body !== null
		? new Response(null, response)
		: response;
}

const XMLNS = "http://s3.amazonaws.com/doc/2006-03-01/";
export const MAX_LIST_KEYS = 1000;
export const MAX_DELETE_KEYS = 1000;

const xmlBuilder = new XMLBuilder({ ignoreAttributes: false });
export const xmlParser = new XMLParser({
	ignoreAttributes: true,
	parseTagValue: false,
});

export function xmlResponse(
	root: string,
	content: Record<string, unknown>,
	status = 200
): Response {
	const body = `<?xml version="1.0" encoding="UTF-8"?>${xmlBuilder.build({
		[root]: { "@_xmlns": XMLNS, ...content },
	})}`;
	return new Response(body, {
		status,
		headers: { "Content-Type": "application/xml" },
	});
}

export function hex(bytes: ArrayLike<number> | ArrayBuffer): string {
	return Buffer.from(bytes).toString("hex");
}

export function coerceArray<T>(value: T | T[] | undefined): T[] {
	if (value === undefined) {
		return [];
	}

	return Array.isArray(value) ? value : [value];
}
