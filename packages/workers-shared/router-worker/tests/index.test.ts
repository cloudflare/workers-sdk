import { createExecutionContext } from "cloudflare:test";
import { describe, it } from "vitest";
import worker from "../src/worker";
import type { Env } from "../src/worker";

describe("unit tests", async () => {
	it("fails if specify running user worker ahead of assets, without user worker", async ({
		expect,
	}) => {
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

	it("it returns fetch from user worker when invoke_user_worker_ahead_of_assets true", async ({
		expect,
	}) => {
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

	it("it returns fetch from asset worker when matching existing asset path", async ({
		expect,
	}) => {
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

	it("it returns fetch from asset worker when matching existing asset path and invoke_user_worker_ahead_of_assets is not provided", async ({
		expect,
	}) => {
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

	it("it returns fetch from user worker when static_routing user_worker rule matches", async ({
		expect,
	}) => {
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

	it("it returns fetch from asset worker when static_routing asset_worker rule matches", async ({
		expect,
	}) => {
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

	it("it returns fetch from asset worker when static_routing asset_worker and user_worker rule matches", async ({
		expect,
	}) => {
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

	it("it returns fetch from asset worker when no static_routing rule matches but asset exists", async ({
		expect,
	}) => {
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

	it("it returns fetch from user worker when no static_routing rule matches and no asset exists", async ({
		expect,
	}) => {
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

	describe.each(["/some/subpath/", "/"])(
		"blocking /_next/image requests hosted at %s with remote URLs",
		(subpath) => {
			it("blocks /_next/image requests with remote URLs when not fetched as image", async ({
				expect,
			}) => {
				const request = new Request(
					`https://example.com${subpath}_next/image?url=https://evil.com/ssrf`
				);
				const ctx = createExecutionContext();

				let contentType: string;

				const env = {
					CONFIG: {
						has_user_worker: true,
						invoke_user_worker_ahead_of_assets: true,
					},
					USER_WORKER: {
						async fetch(_: Request): Promise<Response> {
							return new Response("<!DOCTYPE html><html></html>", {
								headers: { "content-type": contentType },
							});
						},
					},
				} as Env;

				for (contentType of [
					// html should be blocked
					"text/html",
					// multiple values should be blocked
					"image/jpg,text/plain",
					"image/jpg,text/html",
					"text/plain,text/html",
				]) {
					const response = await worker.fetch(request, env, ctx);
					expect(response.status).toBe(403);
					expect(await response.text()).toBe("Blocked");
				}
			});

			it.for([
				{
					description:
						"allows /_next/image requests with remote URLs when fetched as image",
					url: `https://example.com${subpath}_next/image?url=https://example.com/image.jpg`,
					headers: { "sec-fetch-dest": "image" } as HeadersInit,
					userWorkerResponse: {
						body: "fake image data",
						headers: { "content-type": "image/jpeg" },
						status: 200,
					},
					expectedStatus: 200,
					expectedBody: "fake image data",
				},
				{
					description:
						"allows /_next/image requests with remote URLs that have content type starting with image/...",
					url: `https://example.com${subpath}_next/image?url=https://example.com/image.jpg`,
					userWorkerResponse: {
						body: "fake image data",
						headers: { "content-type": "image/jpeg" },
						status: 200,
					},
					expectedStatus: 200,
					expectedBody: "fake image data",
				},
				{
					description:
						"allows /_next/image requests with remote URLs that have content type text/plain",
					url: `https://example.com${subpath}_next/image?url=https://example.com/image.jpg`,
					userWorkerResponse: {
						body: "fake image data",
						headers: { "content-type": "text/plain" },
						status: 200,
					},
					expectedStatus: 200,
					expectedBody: "fake image data",
				},
				{
					description:
						"allows /_next/image requests with remote URLs that have content type text/plain with charset",
					url: `https://example.com${subpath}_next/image?url=https://example.com/image.jpg`,
					userWorkerResponse: {
						body: "fake image data",
						headers: { "content-type": "text/plain;charset=UTF-8" },
						status: 200,
					},
					expectedStatus: 200,
					expectedBody: "fake image data",
				},
				{
					description:
						"allows /_next/image with remote URL and image header regardless of response content",
					url: `https://example.com${subpath}_next/image?url=https://example.com/image.jpg`,
					headers: { "sec-fetch-dest": "image" } as HeadersInit,
					userWorkerResponse: {
						body: "<!DOCTYPE html><html></html>",
						headers: { "content-type": "text/html" },
						status: 200,
					},
					expectedStatus: 200,
					expectedBody: "<!DOCTYPE html><html></html>",
				},
				{
					description: "allows /_next/image requests with local URLs",
					url: `https://example.com${subpath}_next/image?url=/local/image.jpg`,
					headers: {} as HeadersInit,
					userWorkerResponse: {
						body: "local image data",
						headers: { "content-type": "image/jpeg" },
						status: 200,
					},
					expectedStatus: 200,
					expectedBody: "local image data",
				},
				{
					description: "allows /_next/image requests with 304 status",
					url: `https://example.com${subpath}_next/image?url=https://example.com/image.jpg`,
					headers: {} as HeadersInit,
					userWorkerResponse: {
						body: null,
						headers: { "content-type": "text/html" },
						status: 304,
					},
					expectedStatus: 304,
					expectedBody: null,
				},
			])(
				"$description",
				async (
					{ url, headers, userWorkerResponse, expectedStatus, expectedBody },
					{ expect }
				) => {
					const request = new Request(url, { headers });
					const ctx = createExecutionContext();

					const env = {
						CONFIG: {
							has_user_worker: true,
							invoke_user_worker_ahead_of_assets: true,
						},
						USER_WORKER: {
							async fetch(_: Request): Promise<Response> {
								return new Response(userWorkerResponse.body, {
									status: userWorkerResponse.status,
									headers: userWorkerResponse.headers,
								});
							},
						},
					} as Env;

					const response = await worker.fetch(request, env, ctx);
					expect(response.status).toBe(expectedStatus);
					if (expectedBody !== null) {
						expect(await response.text()).toBe(expectedBody);
					}
				}
			);
		}
	);

	describe("blocking /_image requests with protocol relative URLs as the image source", () => {
		it("blocks protocol relative URLs with a different hostname when not fetched as an image", async ({
			expect,
		}) => {
			const request = new Request(
				"https://example.com/_image?href=//evil.com/ssrf"
			);
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
			const ctx = createExecutionContext();

			const response = await worker.fetch(request, env, ctx);
			expect(response.status).toBe(403);
			expect(await response.text()).toBe("Blocked");
		});

		it.for([
			{
				description: "allows protocol relative URLs with the same hostname",
				url: "https://example.com/_image?href=//example.com/image.jpg",
				userWorkerResponse: {
					body: "fake image data",
					headers: { "content-type": "image/jpeg" },
					status: 200,
				},
				expectedStatus: 200,
				expectedBody: "fake image data",
			},
			{
				description:
					"allows protocol relative URLs with a different hostname when fetched as an image",
				url: "https://example.com/_image?href=//another.com/image.jpg",
				headers: { "sec-fetch-dest": "image" },
				userWorkerResponse: {
					body: "fake image data",
					headers: { "content-type": "image/jpeg" },
					status: 200,
				},
				expectedStatus: 200,
				expectedBody: "fake image data",
			},
		])(
			"$description",
			async (
				{ url, headers, userWorkerResponse, expectedStatus, expectedBody },
				{ expect }
			) => {
				const request = new Request(url, { headers });
				const env = {
					CONFIG: {
						has_user_worker: true,
						invoke_user_worker_ahead_of_assets: true,
					},
					USER_WORKER: {
						async fetch(_: Request): Promise<Response> {
							return new Response(userWorkerResponse.body, {
								status: userWorkerResponse.status,
								headers: userWorkerResponse.headers,
							});
						},
					},
				} as Env;
				const ctx = createExecutionContext();

				const response = await worker.fetch(request, env, ctx);
				expect(response.status).toBe(expectedStatus);
				expect(await response.text()).toBe(expectedBody);
			}
		);
	});

	describe("free tier limiting", () => {
		it("returns fetch from asset worker for assets", async ({ expect }) => {
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

		it("returns error page instead of user worker when no asset found", async ({
			expect,
		}) => {
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

		it("returns error page instead of user worker for invoke_user_worker_ahead_of_assets", async ({
			expect,
		}) => {
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

		it("returns error page instead of user worker for user_worker rules", async ({
			expect,
		}) => {
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

		it("returns fetch from asset worker for asset_worker rules", async ({
			expect,
		}) => {
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
