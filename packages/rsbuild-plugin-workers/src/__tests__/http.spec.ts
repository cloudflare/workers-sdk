import { Writable } from "node:stream";
import { Headers, Response } from "miniflare";
import { describe, test } from "vitest";
import { writeResponse } from "../http";
import type * as http from "node:http";

describe("writeResponse", () => {
	test("preserves multiple Set-Cookie headers", async ({ expect }) => {
		const headers = new Headers();
		headers.append("set-cookie", "session=abc; Path=/");
		headers.append(
			"set-cookie",
			"theme=dark; Expires=Thu, 01 Jan 2026 00:00:00 GMT"
		);
		headers.set("content-type", "text/plain");

		const response = new Response("ok", { headers });
		const recordedHeaders = new Map<string, number | string | string[]>();
		const serverResponse = new Writable({
			write(_chunk, _encoding, callback) {
				callback();
			},
		}) as http.ServerResponse;
		serverResponse.setHeader = (
			name: string,
			value: number | string | string[]
		) => {
			recordedHeaders.set(name.toLowerCase(), value);
			return serverResponse;
		};

		await writeResponse(serverResponse, response);

		expect(recordedHeaders.get("set-cookie")).toEqual([
			"session=abc; Path=/",
			"theme=dark; Expires=Thu, 01 Jan 2026 00:00:00 GMT",
		]);
		expect(recordedHeaders.get("content-type")).toBe("text/plain");
	});

	test("streams response body chunks without buffering", async ({ expect }) => {
		const chunks: Buffer[] = [];
		let resolveFirstWrite: () => void = () => {};
		const firstWrite = new Promise<void>((resolve) => {
			resolveFirstWrite = resolve;
		});
		const serverResponse = new Writable({
			write(chunk: Buffer, _encoding, callback) {
				chunks.push(Buffer.from(chunk));
				resolveFirstWrite();
				callback();
			},
		}) as http.ServerResponse;
		serverResponse.setHeader = () => serverResponse;

		let closeStream: () => void = () => {};
		const body = new ReadableStream<Uint8Array>({
			start(controller) {
				controller.enqueue(new TextEncoder().encode("first"));
				closeStream = () => {
					controller.close();
				};
			},
		});
		const response = {
			status: 200,
			statusText: "OK",
			headers: new Headers(),
			body,
		} as unknown as Response;

		const writePromise = writeResponse(serverResponse, response);

		await firstWrite;
		expect(Buffer.concat(chunks).toString()).toBe("first");
		expect(serverResponse.writableEnded).toBe(false);

		closeStream();
		await writePromise;

		expect(serverResponse.writableEnded).toBe(true);
	});
});
