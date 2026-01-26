import { resolve } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { runWranglerDev } from "../../shared/src/run-wrangler-long-lived";

describe("d1-sessions-api - getBookmark", () => {
	describe("with wrangler dev", () => {
		let ip: string, port: number, stop: (() => Promise<unknown>) | undefined;

		beforeAll(async () => {
			({ ip, port, stop } = await runWranglerDev(resolve(__dirname, ".."), [
				"--port=0",
				"--inspector-port=0",
			]));
		});

		afterAll(async () => {
			await stop?.();
		});

		it("should respond with bookmarks before and after a session query", async () => {
			let response = await fetch(`http://${ip}:${port}`);
			let parsed = await response.json();
			expect(response.status).toBe(200);
			expect(parsed).toMatchObject({
				bookmarkBefore: expect.stringMatching(/\w{8}-\w{8}-\w{8}-\w{32}/),
				bookmarkAfter: expect.stringMatching(/\w{8}-\w{8}-\w{8}-\w{32}/),
			});
		});

		it("should progress the bookmark after a write", async () => {
			let response = await fetch(
				`http://${ip}:${port}?q=${encodeURIComponent("create table if not exists users1(id text);")}`
			);
			let parsed = (await response.json()) as {
				bookmarkAfter: string;
				bookmarkBefore: string;
			};
			expect(response.status).toBe(200);
			expect(parsed).toMatchObject({
				bookmarkBefore: expect.stringMatching(/\w{8}-\w{8}-\w{8}-\w{32}/),
				bookmarkAfter: expect.stringMatching(/\w{8}-\w{8}-\w{8}-\w{32}/),
			});
			expect(
				parsed.bookmarkAfter > parsed.bookmarkBefore,
				`before[${parsed.bookmarkBefore}] !== after[${parsed.bookmarkAfter}]`
			).toEqual(true);
		});

		it("should maintain the latest bookmark after many queries", async () => {
			let responses = [];

			for (let i = 0; i < 10; i++) {
				const resp = await fetch(
					`http://${ip}:${port}?q=${encodeURIComponent(`create table if not exists users${i}(id text);`)}`
				);
				let parsed = (await resp.json()) as {
					bookmarkAfter: string;
					bookmarkBefore: string;
				};
				expect(resp.status).toBe(200);
				responses.push(parsed);

				expect(
					parsed.bookmarkAfter > parsed.bookmarkBefore,
					`before[${parsed.bookmarkBefore}] !== after[${parsed.bookmarkAfter}]`
				).toEqual(true);
			}

			const lastBookmark = responses.at(-1)?.bookmarkAfter;
			responses.slice(0, -1).forEach((parsed) => {
				expect(
					parsed.bookmarkAfter < lastBookmark!,
					`previous after[${parsed.bookmarkAfter}] !< lastBookmark[${lastBookmark}]`
				).toEqual(true);
			});
		});
	});
});
