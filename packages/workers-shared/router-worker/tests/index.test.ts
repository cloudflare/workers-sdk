import { createExecutionContext } from "cloudflare:test";
import { describe, expect, it } from "vitest";
import { default as worker } from "../src/index";
import type { Env } from "../src/index";

describe("unit tests", async () => {
	it("fails if specify running user worker ahead of assets, without user worker", async () => {
		const request = new Request("https://example.com");
		const ctx = createExecutionContext();

		const env = {
			CONFIG: {
				invoke_user_worker_ahead_of_assets: true,
				has_user_worker: false,
			},
		} as Env;

		void expect(
			async () => await worker.fetch(request, env, ctx)
		).rejects.toThrowError(
			"Fetch for user worker without having a user worker binding"
		);
	});

	it("it returns fetch from user worker when invoke_user_worker_ahead_of_assets true", async () => {
		const request = new Request("https://example.com");
		const ctx = createExecutionContext();

		const env = {
			CONFIG: {
				invoke_user_worker_ahead_of_assets: true,
				has_user_worker: true,
			},
			USER_WORKER: {
				async fetch(_: Request): Promise<Response> {
					return new Response("hello from user worker");
				},
			},
			ASSET_WORKER: {
				async fetch(_: Request): Promise<Response> {
					return new Response("hello from asset worker");
				},
				async unstable_canFetch(_: Request): Promise<boolean> {
					return true;
				},
			},
		} as Env;

		const response = await worker.fetch(request, env, ctx);
		expect(await response.text()).toEqual("hello from user worker");
	});

	it("it returns fetch from asset worker when matching existing asset path", async () => {
		const request = new Request("https://example.com");
		const ctx = createExecutionContext();

		const env = {
			CONFIG: {
				invoke_user_worker_ahead_of_assets: false,
				has_user_worker: false,
			},
			ASSET_WORKER: {
				async fetch(_: Request): Promise<Response> {
					return new Response("hello from asset worker");
				},
				async unstable_canFetch(_: Request): Promise<boolean> {
					return true;
				},
			},
		} as Env;

		const response = await worker.fetch(request, env, ctx);
		expect(await response.text()).toEqual("hello from asset worker");
	});

	it("it returns fetch from asset worker when matching existing asset path and invoke_user_worker_ahead_of_assets is not provided", async () => {
		const request = new Request("https://example.com");
		const ctx = createExecutionContext();

		const env = {
			CONFIG: {
				has_user_worker: false,
			},
			ASSET_WORKER: {
				async fetch(_: Request): Promise<Response> {
					return new Response("hello from asset worker");
				},
				async unstable_canFetch(_: Request): Promise<boolean> {
					return true;
				},
			},
		} as Env;

		const response = await worker.fetch(request, env, ctx);
		expect(await response.text()).toEqual("hello from asset worker");
	});

	it("returns fetch from user worker when path matches worker_first_paths", async () => {
		const request = new Request("https://example.com/api/test");
		const ctx = createExecutionContext();

		const env = {
			CONFIG: {
				invoke_user_worker_ahead_of_assets: false,
				worker_first_paths: ["/api/"],
				has_user_worker: true,
			},
			USER_WORKER: {
				async fetch(_: Request): Promise<Response> {
					return new Response("hello from user worker");
				},
			},
			ASSET_WORKER: {
				async fetch(_: Request): Promise<Response> {
					return new Response("hello from asset worker");
				},
				async unstable_canFetch(_: Request): Promise<boolean> {
					return true;
				},
			},
		} as Env;

		const response = await worker.fetch(request, env, ctx);
		expect(await response.text()).toEqual("hello from user worker");
	});

	it("returns fetch from asset worker when path does not match worker_first_paths", async () => {
		const request = new Request("https://example.com/static/test.jpg");
		const ctx = createExecutionContext();

		const env = {
			CONFIG: {
				invoke_user_worker_ahead_of_assets: false,
				worker_first_paths: ["/api/", "/admin/"],
				has_user_worker: true,
			},
			USER_WORKER: {
				async fetch(_: Request): Promise<Response> {
					return new Response("hello from user worker");
				},
			},
			ASSET_WORKER: {
				async fetch(_: Request): Promise<Response> {
					return new Response("hello from asset worker");
				},
				async unstable_canFetch(_: Request): Promise<boolean> {
					return true;
				},
			},
		} as Env;

		const response = await worker.fetch(request, env, ctx);
		expect(await response.text()).toEqual("hello from asset worker");
	});

	it("falls back to worker when path does not match worker_first_paths and asset does not exist", async () => {
		const request = new Request("https://example.com/static/missing.jpg");
		const ctx = createExecutionContext();

		const env = {
			CONFIG: {
				invoke_user_worker_ahead_of_assets: false,
				worker_first_paths: ["/api/", "/admin/"],
				has_user_worker: true,
			},
			USER_WORKER: {
				async fetch(_: Request): Promise<Response> {
					return new Response("hello from user worker");
				},
			},
			ASSET_WORKER: {
				async fetch(_: Request): Promise<Response> {
					return new Response("hello from asset worker");
				},
				async unstable_canFetch(_: Request): Promise<boolean> {
					return false;
				},
			},
		} as Env;

		const response = await worker.fetch(request, env, ctx);
		expect(await response.text()).toEqual("hello from user worker");
	});

	it("fails if specify worker_first_paths without user worker", async () => {
		const request = new Request("https://example.com/api/test");
		const ctx = createExecutionContext();

		const env = {
			CONFIG: {
				invoke_user_worker_ahead_of_assets: false,
				worker_first_paths: ["/api/"],
				has_user_worker: false,
			},
		} as Env;

		void expect(
			async () => await worker.fetch(request, env, ctx)
		).rejects.toThrowError(
			"Fetch for user worker without having a user worker binding"
		);
	});
});
