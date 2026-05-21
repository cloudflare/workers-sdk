import { resolve } from "node:path";
import { afterAll, beforeAll, describe, it } from "vitest";
import { createServer } from "wrangler";

const server = createServer({
	root: resolve(__dirname, ".."),
	workers: [{ configPath: "wrangler.jsonc" }],
});

describe("d1-sessions-api - getBookmark", () => {
	describe("with createServer", () => {
		beforeAll(async () => {
			await server.listen();
		});

		afterAll(async () => {
			await server.close();
		});

		it("should respond with bookmarks before and after a session query", async ({
			expect,
		}) => {
			let response = await server.fetch("/");
			let parsed = await response.json();
			expect(response.status).toBe(200);
			expect(parsed).toMatchObject({
				bookmarkBefore: expect.stringMatching(/\w{8}-\w{8}-\w{8}-\w{32}/),
				bookmarkAfter: expect.stringMatching(/\w{8}-\w{8}-\w{8}-\w{32}/),
			});
		});

		it("should progress the bookmark after a write", async ({ expect }) => {
			let response = await server.fetch(
				`/?q=${encodeURIComponent("create table if not exists users1(id text);")}`
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

		it("should maintain the latest bookmark after many queries", async ({
			expect,
		}) => {
			let responses = [];

			for (let i = 0; i < 10; i++) {
				const resp = await server.fetch(
					`/?q=${encodeURIComponent(`create table if not exists users${i}(id text);`)}`
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
