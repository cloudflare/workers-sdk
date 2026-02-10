import assert from "node:assert";
import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import {
	ReadableByteStreamController,
	ReadableStream,
	ReadableStreamBYOBRequest,
} from "node:stream/web";
import { TextDecoder, TextEncoder } from "node:util";
import { sanitisePath } from "miniflare";
import { onTestFinished } from "vitest";

const encoder = new TextEncoder();
const decoder = new TextDecoder();

export function utf8Encode(value: string): Uint8Array {
	return encoder.encode(value);
}
export function utf8Decode(encoded?: Uint8Array): string {
	return decoder.decode(encoded);
}

const tmpRoot = path.resolve(".tmp");
export async function useTmp(testName?: string): Promise<string> {
	// If no test name is provided, use a random name
	const name = testName ?? crypto.randomBytes(4).toString("hex");
	const filePath = path.join(
		tmpRoot,
		sanitisePath(name),
		crypto.randomBytes(4).toString("hex")
	);
	await fs.mkdir(filePath, { recursive: true });
	return filePath;
}

export function useCwd(cwd: string) {
	const originalCwd = process.cwd();
	const originalPWD = process.env.PWD;
	process.chdir(cwd);
	process.env.PWD = cwd;
	onTestFinished(() => {
		process.chdir(originalCwd);
		process.env.PWD = originalPWD;
	});
}

type ValidReadableStreamBYOBRequest = Omit<
	ReadableStreamBYOBRequest,
	"view"
> & { readonly view: Uint8Array };
function unwrapBYOBRequest(
	controller: ReadableByteStreamController
): ValidReadableStreamBYOBRequest {
	// `controller.byobRequest` is typed as `undefined` in `@types/node`, but
	// should actually be `ReadableStreamBYOBRequest | undefined`. Unfortunately,
	// annotating `byobRequest` as `ReadableStreamBYOBRequest | undefined` doesn't
	// help here. Because of TypeScript's data flow analysis, it thinks
	// `controller.view` is `never`.
	const byobRequest = controller.byobRequest as
		| ReadableStreamBYOBRequest
		| undefined;
	assert(byobRequest !== undefined);

	// Specifying `autoAllocateChunkSize` means we'll always have a view,
	// even when using a default reader
	assert(byobRequest.view !== null);
	// Just asserted `view` is non-null, so this cast is safe
	return byobRequest as ValidReadableStreamBYOBRequest;
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
