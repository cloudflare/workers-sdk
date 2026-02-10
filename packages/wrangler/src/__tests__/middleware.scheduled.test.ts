import * as fs from "node:fs";
import { beforeEach, describe, it, vi } from "vitest";
import { unstable_dev } from "../api";
import { runInTempDir } from "./helpers/run-in-tmp";

vi.unmock("child_process");
vi.unmock("undici");

describe("run scheduled events with middleware", () => {
	describe("module workers", () => {
		runInTempDir();

		beforeEach(() => {
			const scriptContent = `
			export default {
				fetch(request, env, ctx) {
					const url = new URL(request.url);
					if (url.pathname === "/__scheduled") {
						return new Response("Fetch triggered at /__scheduled");
					}
					return new Response("Hello world!");
				},
				scheduled(controller, env, ctx) {
					// Doing something scheduled in modules...
				},
			};
			`;
			fs.writeFileSync("index.js", scriptContent);

			const scheduledScriptContent = `
			export default {
				scheduled(controller, env, ctx) {
					// Doing something scheduled in modules...
				},
			};
			`;
			fs.writeFileSync("only-scheduled.js", scheduledScriptContent);
		});

		it("should not intercept when middleware is not enabled", async ({
			expect,
		}) => {
			const worker = await unstable_dev("index.js", {
				ip: "127.0.0.1",
				experimental: {
					disableExperimentalWarning: true,
					disableDevRegistry: true,
				},
			});

			const resp = await worker.fetch("/__scheduled");
			let text;
			if (resp) {
				text = await resp.text();
			}
			expect(text).toMatchInlineSnapshot(`"Fetch triggered at /__scheduled"`);
			await worker.stop();
		});

		it("should intercept when middleware is enabled", async ({ expect }) => {
			const worker = await unstable_dev("index.js", {
				ip: "127.0.0.1",
				experimental: {
					disableExperimentalWarning: true,
					disableDevRegistry: true,
					testScheduled: true,
				},
			});

			const resp = await worker.fetch("/__scheduled");
			let text;
			if (resp) {
				text = await resp.text();
			}
			expect(text).toMatchInlineSnapshot(`"Ran scheduled event"`);
			await worker.stop();
		});

		it("should not trigger scheduled event on wrong route", async ({
			expect,
		}) => {
			const worker = await unstable_dev("index.js", {
				ip: "127.0.0.1",
				experimental: {
					disableExperimentalWarning: true,
					disableDevRegistry: true,
					testScheduled: true,
				},
			});

			const resp = await worker.fetch("/test");
			let text;
			if (resp) {
				text = await resp.text();
			}
			expect(text).toMatchInlineSnapshot(`"Hello world!"`);
			await worker.stop();
		});

		it("should respond with 404 for favicons", async ({ expect }) => {
			const worker = await unstable_dev("only-scheduled.js", {
				ip: "127.0.0.1",
				experimental: {
					disableExperimentalWarning: true,
					disableDevRegistry: true,
					testScheduled: true,
				},
			});

			const resp = await worker.fetch("/favicon.ico", {
				headers: {
					referer: "http://localhost/__scheduled",
				},
			});

			expect(resp.status).toEqual(404);
			await worker.stop();
		});
		it("should not respond with 404 for favicons if user-worker has a response", async ({
			expect,
		}) => {
			const worker = await unstable_dev("index.js", {
				ip: "127.0.0.1",
				experimental: {
					disableExperimentalWarning: true,
					disableDevRegistry: true,
					testScheduled: true,
				},
			});

			const resp = await worker.fetch("/favicon.ico", {
				headers: {
					referer: "http://localhost/__scheduled",
				},
			});

			expect(resp.status).not.toEqual(404);
			await worker.stop();
		});
	});

	describe("service workers", () => {
		runInTempDir();

		beforeEach(() => {
			const scriptContent = `
			addEventListener("scheduled", (event) => {
				// Doing something scheduled in service worker...
			});

			addEventListener("fetch", (event) => {
				const url = new URL(event.request.url);
				if (url.pathname === "/__scheduled") {
					event.respondWith(new Response("Fetch triggered at /__scheduled"));
				} else {
					event.respondWith(new Response("Hello world!"));
				}
			});
			`;
			fs.writeFileSync("index.js", scriptContent);

			const scheduledScriptContent = `
			addEventListener("scheduled", (event) => {
				// Doing something scheduled in service worker...
			});
			`;
			fs.writeFileSync("only-scheduled.js", scheduledScriptContent);
		});

		it("should not intercept when middleware is not enabled", async ({
			expect,
		}) => {
			const worker = await unstable_dev("index.js", {
				ip: "127.0.0.1",
				experimental: {
					disableExperimentalWarning: true,
					disableDevRegistry: true,
				},
			});

			const resp = await worker.fetch("/__scheduled");
			let text;
			if (resp) {
				text = await resp.text();
			}
			expect(text).toMatchInlineSnapshot(`"Fetch triggered at /__scheduled"`);
			await worker.stop();
		});

		it("should intercept when middleware is enabled", async ({ expect }) => {
			const worker = await unstable_dev("index.js", {
				ip: "127.0.0.1",
				experimental: {
					disableExperimentalWarning: true,
					disableDevRegistry: true,
					testScheduled: true,
				},
			});

			const resp = await worker.fetch("/__scheduled");
			let text;
			if (resp) {
				text = await resp.text();
			}
			expect(text).toMatchInlineSnapshot(`"Ran scheduled event"`);
			await worker.stop();
		});

		it("should not trigger scheduled event on wrong route", async ({
			expect,
		}) => {
			const worker = await unstable_dev("index.js", {
				ip: "127.0.0.1",
				experimental: {
					disableExperimentalWarning: true,
					disableDevRegistry: true,
					testScheduled: true,
				},
			});

			const resp = await worker.fetch("/test");
			let text;
			if (resp) {
				text = await resp.text();
			}
			expect(text).toMatchInlineSnapshot(`"Hello world!"`);
			await worker.stop();
		});

		it("should respond with 404 for favicons", async ({ expect }) => {
			const worker = await unstable_dev("only-scheduled.js", {
				ip: "127.0.0.1",
				experimental: {
					disableExperimentalWarning: true,
					disableDevRegistry: true,
					testScheduled: true,
				},
			});

			const resp = await worker.fetch("/favicon.ico", {
				headers: {
					referer: "http://localhost/__scheduled",
				},
			});

			expect(resp.status).toEqual(404);
			await worker.stop();
		});
		it("should not respond with 404 for favicons if user-worker has a response", async ({
			expect,
		}) => {
			const worker = await unstable_dev("index.js", {
				ip: "127.0.0.1",
				experimental: {
					disableExperimentalWarning: true,
					disableDevRegistry: true,
					testScheduled: true,
				},
			});

			const resp = await worker.fetch("/favicon.ico", {
				headers: {
					referer: "http://localhost/__scheduled",
				},
			});

			expect(resp.status).not.toEqual(404);
			await worker.stop();
		});
	});
});
