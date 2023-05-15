import crypto from "crypto";
import fs from "fs/promises";
import path from "path";
import { ReadableStream } from "stream/web";
import { TextDecoder, TextEncoder } from "util";
import { ExecutionContext } from "ava";
import { sanitisePath, unwrapBYOBRequest } from "miniflare";

const encoder = new TextEncoder();
const decoder = new TextDecoder();

export function utf8Encode(value: string): Uint8Array {
	return encoder.encode(value);
}
export function utf8Decode(encoded?: Uint8Array): string {
	return decoder.decode(encoded);
}

const tmpRoot = path.resolve(".tmp");
export async function useTmp(t: ExecutionContext): Promise<string> {
	const filePath = path.join(
		tmpRoot,
		sanitisePath(t.title),
		crypto.randomBytes(4).toString("hex")
	);
	await fs.mkdir(filePath, { recursive: true });
	return filePath;
}

export function createJunkStream(length: number): ReadableStream<Uint8Array> {
	let position = 0;
	return new ReadableStream({
		type: "bytes",
		autoAllocateChunkSize: 1024,
		pull(controller) {
			const byobRequest = unwrapBYOBRequest(controller);
			const v = byobRequest.view;
			const chunkLength = Math.min(v.byteLength, length - position);
			for (let i = 0; i < chunkLength; i++) v[i] = 120; // 'x'
			if (chunkLength === 0) controller.close();
			position += chunkLength;
			byobRequest.respond(chunkLength);
		},
	});
}
