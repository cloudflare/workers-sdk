import { Buffer } from "node:buffer";
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

export function hex(bytes: ArrayLike<number> | ArrayBuffer): string {
	return Buffer.from(bytes).toString("hex");
}
