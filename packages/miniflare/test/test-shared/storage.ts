import crypto from "crypto";
import fs from "fs/promises";
import path from "path";
import { ReadableStream } from "stream/web";
import { TextDecoder, TextEncoder } from "util";
import { Timers, sanitisePath, unwrapBYOBRequest } from "@miniflare/tre";
import { ExecutionContext } from "ava";

const encoder = new TextEncoder();
const decoder = new TextDecoder();

export function utf8Encode(value: string): Uint8Array {
	return encoder.encode(value);
}
export function utf8Decode(encoded?: Uint8Array): string {
	return decoder.decode(encoded);
}

// Stored expiration value to signal an expired key. Storages using actual
// time should interpret this as the current time.
export const TIME_EXPIRED = 500;
// Time in seconds the testClock always returns:
// TIME_EXPIRED < TIME_NOW < TIME_EXPIRING
export const TIME_NOW = 750;
// Stored expiration value to signal a key that will expire in the future.
// Storages using actual time should interpret this as the current time + 1hr.
// Tests will check the expiry is within 120s of this.
export const TIME_EXPIRING = 1000;

// TODO(soon): remove once we remove the old storage system
export const testTimers: Timers = {
	now: () => TIME_NOW * 1000,
	queueMicrotask,
};

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
