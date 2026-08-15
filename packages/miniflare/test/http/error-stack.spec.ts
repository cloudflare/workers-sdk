import zlib from "node:zlib";
import { test } from "vitest";
import {
	MAX_ERROR_STACK_BYTES,
	MAX_GZIP_ROUNDS,
	readErrorStackBody,
} from "../../src/http/error-stack";

const ERROR_JSON = JSON.stringify({
	message: "Unusual oops!",
	name: "Error",
});

test("gunzips an ERROR_STACK body that was left compressed", async ({
	expect,
}) => {
	const response = new Response(zlib.gzipSync(ERROR_JSON), {
		headers: {
			"Content-Encoding": "gzip",
			"Content-Type": "application/json",
		},
		status: 500,
	});
	await expect(readErrorStackBody(response)).resolves.toBe(ERROR_JSON);
});

test("gunzips nested gzip ERROR_STACK bodies", async ({ expect }) => {
	const response = new Response(zlib.gzipSync(zlib.gzipSync(ERROR_JSON)), {
		headers: {
			"Content-Encoding": "gzip",
			"Content-Type": "application/json",
		},
		status: 500,
	});
	await expect(readErrorStackBody(response)).resolves.toBe(ERROR_JSON);
});

test("does not gunzip a decompressed body that still carries Content-Encoding", async ({
	expect,
}) => {
	const response = new Response(ERROR_JSON, {
		headers: {
			"Content-Encoding": "gzip",
			"Content-Type": "application/json",
		},
		status: 500,
	});
	await expect(readErrorStackBody(response)).resolves.toBe(ERROR_JSON);
});

test("falls back to the payload header when the body is empty", async ({
	expect,
}) => {
	const response = new Response(null, {
		headers: {
			"MF-Experimental-Error-Stack-Payload": encodeURIComponent(ERROR_JSON),
		},
		status: 500,
	});
	await expect(readErrorStackBody(response)).resolves.toBe(ERROR_JSON);
});

test("falls back to the payload header when gzip data is corrupt", async ({
	expect,
}) => {
	const response = new Response(Buffer.from([0x1f, 0x8b, 0x08, 0x00]), {
		headers: {
			"Content-Encoding": "gzip",
			"MF-Experimental-Error-Stack-Payload": encodeURIComponent(ERROR_JSON),
		},
		status: 500,
	});
	await expect(readErrorStackBody(response)).resolves.toBe(ERROR_JSON);
});

test("falls back to the payload header when inflated gzip exceeds the size cap", async ({
	expect,
}) => {
	const response = new Response(
		zlib.gzipSync("x".repeat(MAX_ERROR_STACK_BYTES + 1)),
		{
			headers: {
				"Content-Encoding": "gzip",
				"MF-Experimental-Error-Stack-Payload": encodeURIComponent(ERROR_JSON),
			},
			status: 500,
		}
	);
	await expect(readErrorStackBody(response)).resolves.toBe(ERROR_JSON);
});

test("falls back to the payload header when gzip nesting exceeds the round cap", async ({
	expect,
}) => {
	let nested: Buffer = Buffer.from(ERROR_JSON);
	for (let i = 0; i < MAX_GZIP_ROUNDS + 1; i++) {
		nested = zlib.gzipSync(nested);
	}
	const response = new Response(nested, {
		headers: {
			"Content-Encoding": "gzip",
			"MF-Experimental-Error-Stack-Payload": encodeURIComponent(ERROR_JSON),
		},
		status: 500,
	});
	await expect(readErrorStackBody(response)).resolves.toBe(ERROR_JSON);
});
