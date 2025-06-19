import { createExecutionContext } from "cloudflare:test";
import { describe, expect, it } from "vitest";
import worker from "../src/worker";
import type { Env } from "../src/worker";

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

		await expect(
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

	it("it returns fetch from user worker when static_routing user_worker rule matches", async () => {
		const request = new Request("https://example.com/api/includeme");
		const ctx = createExecutionContext();

		const env = {
			CONFIG: {
				has_user_worker: true,
				static_routing: {
					user_worker: ["/api/*"],
				},
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

	it("it returns fetch from asset worker when static_routing asset_worker rule matches", async () => {
		const request = new Request("https://example.com/api/excludeme");
		const ctx = createExecutionContext();

		const env = {
			CONFIG: {
				has_user_worker: true,
				static_routing: {
					user_worker: ["/api/includeme"],
					asset_worker: ["/api/excludeme"],
				},
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

	it("it returns fetch from asset worker when static_routing asset_worker and user_worker rule matches", async () => {
		const request = new Request("https://example.com/api/excludeme");
		const ctx = createExecutionContext();

		const env = {
			CONFIG: {
				has_user_worker: true,
				static_routing: {
					user_worker: ["/api/*"],
					asset_worker: ["/api/excludeme"],
				},
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

	it("it returns fetch from asset worker when no static_routing rule matches but asset exists", async () => {
		const request = new Request("https://example.com/someasset");
		const ctx = createExecutionContext();

		const env = {
			CONFIG: {
				has_user_worker: true,
				static_routing: {
					user_worker: ["/api/*"],
				},
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

	it("it returns fetch from user worker when no static_routing rule matches and no asset exists", async () => {
		const request = new Request("https://example.com/somemissingasset");
		const ctx = createExecutionContext();

		const env = {
			CONFIG: {
				has_user_worker: true,
				static_routing: {
					user_worker: ["/api/*"],
				},
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

	it("blocks /_next/image requests with remote URLs when not fetched as image", async () => {
		const request = new Request(
			"https://example.com/_next/image?url=https://evil.com/ssrf"
		);
		const ctx = createExecutionContext();

		const env = {
			CONFIG: {
				has_user_worker: true,
				invoke_user_worker_ahead_of_assets: true,
			},
			USER_WORKER: {
				async fetch(_: Request): Promise<Response> {
					return new Response("<!DOCTYPE html><html></html>", {
						headers: { "content-type": "text/html" },
					});
				},
			},
		} as Env;

		const response = await worker.fetch(request, env, ctx);
		expect(response.status).toBe(403);
		expect(await response.text()).toBe("Blocked");
	});

	it("allows /_next/image requests with remote URLs when fetched as image", async () => {
		const request = new Request(
			"https://example.com/_next/image?url=https://example.com/image.jpg",
			{
				headers: { "sec-fetch-dest": "image" },
			}
		);
		const ctx = createExecutionContext();

		const env = {
			CONFIG: {
				has_user_worker: true,
				invoke_user_worker_ahead_of_assets: true,
			},
			USER_WORKER: {
				async fetch(_: Request): Promise<Response> {
					return new Response("fake image data", {
						headers: { "content-type": "image/jpeg" },
					});
				},
			},
		} as Env;

		const response = await worker.fetch(request, env, ctx);
		expect(response.status).toBe(200);
		expect(await response.text()).toBe("fake image data");
	});

	it("allows /_next/image with remote URL and image header regardless of response content", async () => {
		const request = new Request(
			"https://example.com/_next/image?url=https://example.com/image.jpg",
			{
				headers: { "sec-fetch-dest": "image" },
			}
		);
		const ctx = createExecutionContext();

		const env = {
			CONFIG: {
				has_user_worker: true,
				invoke_user_worker_ahead_of_assets: true,
			},
			USER_WORKER: {
				async fetch(_: Request): Promise<Response> {
					return new Response("<!DOCTYPE html><html></html>", {
						headers: { "content-type": "text/html" },
					});
				},
			},
		} as Env;

		const response = await worker.fetch(request, env, ctx);
		expect(response.status).toBe(200);
		expect(await response.text()).toBe("<!DOCTYPE html><html></html>");
	});

	it("allows /_next/image requests with local URLs", async () => {
		const request = new Request(
			"https://example.com/_next/image?url=/local/image.jpg"
		);
		const ctx = createExecutionContext();

		const env = {
			CONFIG: {
				has_user_worker: true,
				invoke_user_worker_ahead_of_assets: true,
			},
			USER_WORKER: {
				async fetch(_: Request): Promise<Response> {
					return new Response("local image data", {
						headers: { "content-type": "image/jpeg" },
					});
				},
			},
		} as Env;

		const response = await worker.fetch(request, env, ctx);
		expect(response.status).toBe(200);
		expect(await response.text()).toBe("local image data");
	});

	it("allows /_next/image requests with 304 status", async () => {
		const request = new Request(
			"https://example.com/_next/image?url=https://example.com/image.jpg"
		);
		const ctx = createExecutionContext();

		const env = {
			CONFIG: {
				has_user_worker: true,
				invoke_user_worker_ahead_of_assets: true,
			},
			USER_WORKER: {
				async fetch(_: Request): Promise<Response> {
					return new Response(null, {
						status: 304,
						headers: { "content-type": "text/html" },
					});
				},
			},
		} as Env;

		const response = await worker.fetch(request, env, ctx);
		expect(response.status).toBe(304);
	});

	describe("free tier limiting", () => {
		it("returns fetch from asset worker for assets", async () => {
			const request = new Request("https://example.com/asset");
			const ctx = createExecutionContext();

			const env = {
				CONFIG: {
					has_user_worker: true,
				},
				EYEBALL_CONFIG: { limitedAssetsOnly: true },
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

		it("returns error page instead of user worker when no asset found", async () => {
			const request = new Request("https://example.com/asset");
			const ctx = createExecutionContext();

			const env = {
				CONFIG: {
					has_user_worker: true,
				},
				EYEBALL_CONFIG: { limitedAssetsOnly: true },
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
			expect(response.status).toEqual(429);
			const text = await response.text();
			expect(text).not.toEqual("hello from user worker");
			expect(text).toContain("This website has been temporarily rate limited");
		});

		it("returns error page instead of user worker for invoke_user_worker_ahead_of_assets", async () => {
			const request = new Request("https://example.com/asset");
			const ctx = createExecutionContext();

			const env = {
				CONFIG: {
					has_user_worker: true,
					invoke_user_worker_ahead_of_assets: true,
				},
				EYEBALL_CONFIG: { limitedAssetsOnly: true },
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
			expect(response.status).toEqual(429);
			const text = await response.text();
			expect(text).not.toEqual("hello from user worker");
			expect(text).toContain("This website has been temporarily rate limited");
		});

		it("returns error page instead of user worker for user_worker rules", async () => {
			const request = new Request("https://example.com/api/asset");
			const ctx = createExecutionContext();

			const env = {
				CONFIG: {
					has_user_worker: true,
					static_routing: {
						user_worker: ["/api/*"],
					},
				},
				EYEBALL_CONFIG: { limitedAssetsOnly: true },
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
			expect(response.status).toEqual(429);
			const text = await response.text();
			expect(text).not.toEqual("hello from user worker");
			expect(text).toContain("This website has been temporarily rate limited");
		});

		it("returns fetch from asset worker for asset_worker rules", async () => {
			const request = new Request("https://example.com/api/asset");
			const ctx = createExecutionContext();

			const env = {
				CONFIG: {
					has_user_worker: true,
					static_routing: {
						user_worker: ["/api/*"],
						asset_worker: ["/api/asset"],
					},
				},
				EYEBALL_CONFIG: { limitedAssetsOnly: true },
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
	});
});
