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
		const serverResponse = {
			setHeader(name: string, value: number | string | string[]) {
				recordedHeaders.set(name.toLowerCase(), value);
				return this;
			},
			end() {
				return this;
			},
		} as http.ServerResponse;

		await writeResponse(serverResponse, response);

		expect(recordedHeaders.get("set-cookie")).toEqual([
			"session=abc; Path=/",
			"theme=dark; Expires=Thu, 01 Jan 2026 00:00:00 GMT",
		]);
		expect(recordedHeaders.get("content-type")).toBe("text/plain");
	});
});
