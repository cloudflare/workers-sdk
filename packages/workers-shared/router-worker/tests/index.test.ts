import {
	SELF,
	createExecutionContext,
	env as runtimeEnv,
} from "cloudflare:test";
import { describe, it, vi } from "vitest";
import {
	COHORT_LOOKUP_TIMEOUT_MS,
	lookupCohort,
} from "../../utils/cohort";
import { EntrypointType } from "../src/analytics";
import routerWorker, {
	RouterInnerEntrypoint,
	RouterPlatformError,
} from "../src/worker";
import type { AccountCohortQuerierBinding } from "../../utils/cohort";
import type { ReadyAnalyticsEvent } from "../src/types";
import type { Env } from "../src/worker";

async function fetchFromInnerEntrypoint(
	request: Request,
	env: Env,
	ctx: ExecutionContext
): Promise<Response> {
	return new RouterInnerEntrypoint(ctx, env).fetch(request);
}

describe("runtime loopback", () => {
	it("routes through outer->inner loopback at runtime boundary", async ({
		expect,
	}) => {
		(runtimeEnv as Env).CONFIG = {
			has_user_worker: false,
		};
		(runtimeEnv as Env).ASSET_WORKER = {
			async fetch(_request: Request): Promise<Response> {
				return new Response("loopback asset worker");
			},
			async unstable_canFetch(_request: Request): Promise<boolean> {
				return true;
			},
		} as Env["ASSET_WORKER"];

		const response = await SELF.fetch("https://example.com");

		expect(response.status).toBe(200);
		expect(await response.text()).toBe("loopback asset worker");
	});
});

describe("inner entrypoint unit tests", () => {
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
			async () => await fetchFromInnerEntrypoint(request, env, ctx)
		).rejects.toThrowError(
			"Fetch for user worker without having a user worker binding"
		);
	});

	it("returns fetch from user worker when invoke_user_worker_ahead_of_assets true", async ({
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
				async fetch(_request: Request): Promise<Response> {
					return new Response("hello from user worker");
				},
			},
			ASSET_WORKER: {
				async fetch(_request: Request): Promise<Response> {
					return new Response("hello from asset worker");
				},
				async unstable_canFetch(_request: Request): Promise<boolean> {
					return true;
				},
			},
		} as Env;

		const response = await fetchFromInnerEntrypoint(request, env, ctx);
		expect(await response.text()).toEqual("hello from user worker");
	});

	it("returns fetch from asset worker when matching existing asset path", async ({
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
				async fetch(_request: Request): Promise<Response> {
					return new Response("hello from asset worker");
				},
				async unstable_canFetch(_request: Request): Promise<boolean> {
					return true;
				},
			},
		} as Env;

		const response = await fetchFromInnerEntrypoint(request, env, ctx);
		expect(await response.text()).toEqual("hello from asset worker");
	});

	it("returns fetch from asset worker when matching existing asset path and invoke_user_worker_ahead_of_assets is not provided", async ({
		expect,
	}) => {
		const request = new Request("https://example.com");
		const ctx = createExecutionContext();

		const env = {
			CONFIG: {
				has_user_worker: false,
			},
			ASSET_WORKER: {
				async fetch(_request: Request): Promise<Response> {
					return new Response("hello from asset worker");
				},
				async unstable_canFetch(_request: Request): Promise<boolean> {
					return true;
				},
			},
		} as Env;

		const response = await fetchFromInnerEntrypoint(request, env, ctx);
		expect(await response.text()).toEqual("hello from asset worker");
	});

	it("returns fetch from user worker when static_routing user_worker rule matches", async ({
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
				async fetch(_request: Request): Promise<Response> {
					return new Response("hello from user worker");
				},
			},
			ASSET_WORKER: {
				async fetch(_request: Request): Promise<Response> {
					return new Response("hello from asset worker");
				},
				async unstable_canFetch(_request: Request): Promise<boolean> {
					return true;
				},
			},
		} as Env;

		const response = await fetchFromInnerEntrypoint(request, env, ctx);
		expect(await response.text()).toEqual("hello from user worker");
	});

	it("returns fetch from asset worker when static_routing asset_worker rule matches", async ({
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
				async fetch(_request: Request): Promise<Response> {
					return new Response("hello from user worker");
				},
			},
			ASSET_WORKER: {
				async fetch(_request: Request): Promise<Response> {
					return new Response("hello from asset worker");
				},
				async unstable_canFetch(_request: Request): Promise<boolean> {
					return true;
				},
			},
		} as Env;

		const response = await fetchFromInnerEntrypoint(request, env, ctx);
		expect(await response.text()).toEqual("hello from asset worker");
	});

	it("returns fetch from asset worker when static_routing asset_worker and user_worker rule matches", async ({
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
				async fetch(_request: Request): Promise<Response> {
					return new Response("hello from user worker");
				},
			},
			ASSET_WORKER: {
				async fetch(_request: Request): Promise<Response> {
					return new Response("hello from asset worker");
				},
				async unstable_canFetch(_request: Request): Promise<boolean> {
					return true;
				},
			},
		} as Env;

		const response = await fetchFromInnerEntrypoint(request, env, ctx);
		expect(await response.text()).toEqual("hello from asset worker");
	});

	// Regression test for WC-5014 / Sentry #31445454: previously threw
	// `TypeError: rules is not iterable` when static_routing was defined but
	// user_worker was undefined.
	it("does not throw when static_routing is defined without user_worker rules", async ({
		expect,
	}) => {
		const request = new Request("https://example.com/unmatched-path");
		const ctx = createExecutionContext();

		const env = {
			CONFIG: {
				has_user_worker: true,
				static_routing: {
					asset_worker: ["/assets/*"],
				},
			},
			USER_WORKER: {
				async fetch(_request: Request): Promise<Response> {
					return new Response("hello from user worker");
				},
			},
			ASSET_WORKER: {
				async fetch(_request: Request): Promise<Response> {
					return new Response("hello from asset worker");
				},
				async unstable_canFetch(_request: Request): Promise<boolean> {
					return true;
				},
			},
		} as Env;

		const response = await fetchFromInnerEntrypoint(request, env, ctx);
		expect(await response.text()).toEqual("hello from asset worker");
	});

	it("returns fetch from asset worker when no static_routing rule matches but asset exists", async ({
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
				async fetch(_request: Request): Promise<Response> {
					return new Response("hello from user worker");
				},
			},
			ASSET_WORKER: {
				async fetch(_request: Request): Promise<Response> {
					return new Response("hello from asset worker");
				},
				async unstable_canFetch(_request: Request): Promise<boolean> {
					return true;
				},
			},
		} as Env;

		const response = await fetchFromInnerEntrypoint(request, env, ctx);
		expect(await response.text()).toEqual("hello from asset worker");
	});

	it("returns fetch from user worker when no static_routing rule matches and no asset exists", async ({
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
				async fetch(_request: Request): Promise<Response> {
					return new Response("hello from user worker");
				},
			},
			ASSET_WORKER: {
				async fetch(_request: Request): Promise<Response> {
					return new Response("hello from asset worker");
				},
				async unstable_canFetch(_request: Request): Promise<boolean> {
					return false;
				},
			},
		} as Env;

		const response = await fetchFromInnerEntrypoint(request, env, ctx);
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
						async fetch(_request: Request): Promise<Response> {
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
					const response = await fetchFromInnerEntrypoint(request, env, ctx);
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
							async fetch(_request: Request): Promise<Response> {
								return new Response(userWorkerResponse.body, {
									status: userWorkerResponse.status,
									headers: userWorkerResponse.headers,
								});
							},
						},
					} as Env;

					const response = await fetchFromInnerEntrypoint(request, env, ctx);
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
					async fetch(_request: Request): Promise<Response> {
						return new Response("<!DOCTYPE html><html></html>", {
							headers: { "content-type": "text/html" },
						});
					},
				},
			} as Env;
			const ctx = createExecutionContext();

			const response = await fetchFromInnerEntrypoint(request, env, ctx);
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
						async fetch(_request: Request): Promise<Response> {
							return new Response(userWorkerResponse.body, {
								status: userWorkerResponse.status,
								headers: userWorkerResponse.headers,
							});
						},
					},
				} as Env;
				const ctx = createExecutionContext();

				const response = await fetchFromInnerEntrypoint(request, env, ctx);
				expect(response.status).toBe(expectedStatus);
				expect(await response.text()).toBe(expectedBody);
			}
		);
	});

	describe("Handling /cdn-cgi\\ backslash bypass with redirect", () => {
		const backslashBypassCases = [
			{
				description: String.raw`/cdn-cgi\image bypass`,
				rawUrl: String.raw`https://example.com/cdn-cgi\image/q=75/https://evil.com/ssrf`,
				expectedLocation:
					"https://example.com/cdn-cgi/image/q=75/https://evil.com/ssrf",
			},
			{
				description: String.raw`/cdn-cgi\_next_cache bypass`,
				rawUrl: String.raw`https://example.com/cdn-cgi\_next_cache/some-data`,
				expectedLocation: "https://example.com/cdn-cgi/_next_cache/some-data",
			},
			{
				description: String.raw`/cdn-cgi\ bypass with arbitrary subpath`,
				rawUrl: String.raw`https://example.com/cdn-cgi\something-else/path`,
				expectedLocation: "https://example.com/cdn-cgi/something-else/path",
			},
			{
				description: String.raw`/cdn-cgi\ bypass with query params`,
				rawUrl: String.raw`https://example.com/cdn-cgi\something-else/path?value=/cdn-cgi/param=foo`,
				expectedLocation:
					"https://example.com/cdn-cgi/something-else/path?value=/cdn-cgi/param=foo",
			},
		];

		it.for(backslashBypassCases)(
			"redirects $description to normalized URL when invoke_user_worker_ahead_of_assets is true",
			async ({ rawUrl, expectedLocation }, { expect }) => {
				const request = new Request(rawUrl);
				// In production, raw backslashes in URLs are preserved in request.url by the
				// Workers runtime. The Request constructor normalizes backslashes to forward
				// slashes, so we use Object.defineProperty to simulate production behavior.
				Object.defineProperty(request, "url", {
					value: rawUrl,
					configurable: true,
				});

				const env = {
					CONFIG: {
						has_user_worker: true,
						invoke_user_worker_ahead_of_assets: true,
					},
					USER_WORKER: {
						async fetch(_request: Request): Promise<Response> {
							return new Response(
								"should not reach user worker as it should be redirected by the router worker"
							);
						},
					},
				} as Env;
				const ctx = createExecutionContext();

				const response = await fetchFromInnerEntrypoint(request, env, ctx);
				expect(response.status).toBe(307);
				expect(response.headers.get("Location")).toBe(expectedLocation);
			}
		);

		it.for(backslashBypassCases)(
			"redirects $description to normalized URL when invoke_user_worker_ahead_of_assets is false and no asset matches",
			async ({ rawUrl, expectedLocation }, { expect }) => {
				const request = new Request(rawUrl);
				Object.defineProperty(request, "url", {
					value: rawUrl,
					configurable: true,
				});

				const env = {
					CONFIG: {
						has_user_worker: true,
						invoke_user_worker_ahead_of_assets: false,
					},
					USER_WORKER: {
						async fetch(_request: Request): Promise<Response> {
							return new Response(
								"should not reach user worker as it should be redirected by the router worker"
							);
						},
					},
					ASSET_WORKER: {
						async fetch(_request: Request): Promise<Response> {
							return new Response(
								"should not reach asset worker as it should be redirected by the router worker"
							);
						},
						async unstable_canFetch(_request: Request): Promise<boolean> {
							return false;
						},
					},
				} as Env;
				const ctx = createExecutionContext();

				const response = await fetchFromInnerEntrypoint(request, env, ctx);
				expect(response.status).toBe(307);
				expect(response.headers.get("Location")).toBe(expectedLocation);
			}
		);

		it.for(backslashBypassCases)(
			"redirects $description to normalized URL when invoke_user_worker_ahead_of_assets is false even if asset exists",
			async ({ rawUrl, expectedLocation }, { expect }) => {
				const request = new Request(rawUrl);
				Object.defineProperty(request, "url", {
					value: rawUrl,
					configurable: true,
				});

				const env = {
					CONFIG: {
						has_user_worker: true,
						invoke_user_worker_ahead_of_assets: false,
					},
					USER_WORKER: {
						async fetch(_request: Request): Promise<Response> {
							return new Response(
								"should not reach user worker as it should be redirected by the router worker"
							);
						},
					},
					ASSET_WORKER: {
						async fetch(_request: Request): Promise<Response> {
							return new Response(
								"should not reach asset worker as it should be redirected by the router worker"
							);
						},
						async unstable_canFetch(_request: Request): Promise<boolean> {
							return true;
						},
					},
				} as Env;
				const ctx = createExecutionContext();

				const response = await fetchFromInnerEntrypoint(request, env, ctx);
				expect(response.status).toBe(307);
				expect(response.headers.get("Location")).toBe(expectedLocation);
			}
		);

		const nonInterferenceCases = [
			{
				description:
					"does not interfere with legitimate /cdn-cgi/ forward-slash requests",
				url: "https://example.com/cdn-cgi/image/q=75/https://other.com/image.jpg",
				userWorkerResponse: {
					body: "image data",
					headers: { "content-type": "image/jpeg" },
					status: 200,
				},
				expectedStatus: 200,
				expectedBody: "image data",
			},
			{
				description:
					"does not interfere with escaped backslashes /cdn-cgi%5C requests",
				url: "https://example.com/cdn-cgi%5Cimage/q=75/https://other.com/image.jpg",
				userWorkerResponse: {
					body: "image data",
					headers: { "content-type": "image/jpeg" },
					status: 200,
				},
				expectedStatus: 200,
				expectedBody: "image data",
			},
			{
				description:
					"does not interfere with escaped forward slashes /cdn-cgi%2F requests",
				url: "https://example.com/cdn-cgi%2Fimage/q=75/https://other.com/image.jpg",
				userWorkerResponse: {
					body: "image data",
					headers: { "content-type": "image/jpeg" },
					status: 200,
				},
				expectedStatus: 200,
				expectedBody: "image data",
			},
			{
				description: "does not interfere with non-cdn-cgi requests",
				url: "https://example.com/some-page",
				userWorkerResponse: {
					body: "page content",
					headers: { "content-type": "text/html" },
					status: 200,
				},
				expectedStatus: 200,
				expectedBody: "page content",
			},
			{
				description: String.raw`does not interfere with non-cdn-cgi requests with /cdn-cgi\ in query`,
				url: String.raw`https://example.com/some-page?redirect=/cdn-cgi\image`,
				userWorkerResponse: {
					body: "page content",
					headers: { "content-type": "text/html" },
					status: 200,
				},
				expectedStatus: 200,
				expectedBody: "page content",
			},
		];

		it.for(nonInterferenceCases)(
			"$description when invoke_user_worker_ahead_of_assets is true",
			async (
				{ url, userWorkerResponse, expectedStatus, expectedBody },
				{ expect }
			) => {
				const request = new Request(url);
				const env = {
					CONFIG: {
						has_user_worker: true,
						invoke_user_worker_ahead_of_assets: true,
					},
					USER_WORKER: {
						async fetch(userWorkerRequest: Request): Promise<Response> {
							const response = new Response(userWorkerResponse.body, {
								status: userWorkerResponse.status,
								headers: userWorkerResponse.headers,
							});
							Object.defineProperty(response, "url", {
								value: userWorkerRequest.url,
								configurable: true,
							});
							return response;
						},
					},
				} as Env;
				const ctx = createExecutionContext();

				const response = await fetchFromInnerEntrypoint(request, env, ctx);
				expect(response.url).toBe(url);
				expect(response.status).toBe(expectedStatus);
				expect(await response.text()).toBe(expectedBody);
			}
		);

		it.for(nonInterferenceCases)(
			"$description when invoke_user_worker_ahead_of_assets is false and no asset matches",
			async (
				{ url, userWorkerResponse, expectedStatus, expectedBody },
				{ expect }
			) => {
				const request = new Request(url);
				const env = {
					CONFIG: {
						has_user_worker: true,
						invoke_user_worker_ahead_of_assets: false,
					},
					USER_WORKER: {
						async fetch(userWorkerRequest: Request): Promise<Response> {
							const response = new Response(userWorkerResponse.body, {
								status: userWorkerResponse.status,
								headers: userWorkerResponse.headers,
							});
							Object.defineProperty(response, "url", {
								value: userWorkerRequest.url,
								configurable: true,
							});
							return response;
						},
					},
					ASSET_WORKER: {
						async fetch(_request: Request): Promise<Response> {
							return new Response(
								"should not reach asset worker as asset does not exist"
							);
						},
						async unstable_canFetch(_request: Request): Promise<boolean> {
							return false;
						},
					},
				} as Env;
				const ctx = createExecutionContext();

				const response = await fetchFromInnerEntrypoint(request, env, ctx);
				expect(response.url).toBe(url);
				expect(response.status).toBe(expectedStatus);
				expect(await response.text()).toBe(expectedBody);
			}
		);

		it.for(nonInterferenceCases)(
			"$description when invoke_user_worker_ahead_of_assets is false even if asset exists",
			async ({ url }, { expect }) => {
				const request = new Request(url);
				const env = {
					CONFIG: {
						has_user_worker: true,
						invoke_user_worker_ahead_of_assets: false,
					},
					USER_WORKER: {
						async fetch(_request: Request): Promise<Response> {
							return new Response(
								"should not reach user worker as it should be handled by asset worker"
							);
						},
					},
					ASSET_WORKER: {
						async fetch(_request: Request): Promise<Response> {
							return new Response("hello from asset worker");
						},
						async unstable_canFetch(_request: Request): Promise<boolean> {
							return true;
						},
					},
				} as Env;
				const ctx = createExecutionContext();

				const response = await fetchFromInnerEntrypoint(request, env, ctx);
				expect(response.status).toBe(200);
				expect(await response.text()).toBe("hello from asset worker");
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
					async fetch(_request: Request): Promise<Response> {
						return new Response("hello from user worker");
					},
				},
				ASSET_WORKER: {
					async fetch(_request: Request): Promise<Response> {
						return new Response("hello from asset worker");
					},
					async unstable_canFetch(_request: Request): Promise<boolean> {
						return true;
					},
				},
			} as Env;

			const response = await fetchFromInnerEntrypoint(request, env, ctx);
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
					async fetch(_request: Request): Promise<Response> {
						return new Response("hello from user worker");
					},
				},
				ASSET_WORKER: {
					async fetch(_request: Request): Promise<Response> {
						return new Response("hello from asset worker");
					},
					async unstable_canFetch(_request: Request): Promise<boolean> {
						return false;
					},
				},
			} as Env;

			const response = await fetchFromInnerEntrypoint(request, env, ctx);
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
					async fetch(_request: Request): Promise<Response> {
						return new Response("hello from user worker");
					},
				},
				ASSET_WORKER: {
					async fetch(_request: Request): Promise<Response> {
						return new Response("hello from asset worker");
					},
					async unstable_canFetch(_request: Request): Promise<boolean> {
						return true;
					},
				},
			} as Env;

			const response = await fetchFromInnerEntrypoint(request, env, ctx);
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
					async fetch(_request: Request): Promise<Response> {
						return new Response("hello from user worker");
					},
				},
				ASSET_WORKER: {
					async fetch(_request: Request): Promise<Response> {
						return new Response("hello from asset worker");
					},
					async unstable_canFetch(_request: Request): Promise<boolean> {
						return true;
					},
				},
			} as Env;

			const response = await fetchFromInnerEntrypoint(request, env, ctx);
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
					async fetch(_request: Request): Promise<Response> {
						return new Response("hello from user worker");
					},
				},
				ASSET_WORKER: {
					async fetch(_request: Request): Promise<Response> {
						return new Response("hello from asset worker");
					},
					async unstable_canFetch(_request: Request): Promise<boolean> {
						return true;
					},
				},
			} as Env;

			const response = await fetchFromInnerEntrypoint(request, env, ctx);
			expect(await response.text()).toEqual("hello from asset worker");
		});
	});
});

// ============================================================
// Helper types and functions for gateway / analytics tests
// ============================================================

type InnerEntrypointOptions = {
	props: Record<string, never>;
	version?: { cohort?: string };
};

function createGatewayCtx(
	innerFetch: (request: Request) => Promise<Response>,
	optionsSink?: InnerEntrypointOptions[]
): ExecutionContext {
	return {
		exports: {
			RouterInnerEntrypoint(options: InnerEntrypointOptions) {
				optionsSink?.push(options);
				return { fetch: innerFetch };
			},
		},
		waitUntil() {},
		passThroughOnException() {},
	} as unknown as ExecutionContext;
}

function createGatewayEnv(overrides?: Record<string, unknown>): {
	env: Env;
	analyticsEvents: ReadyAnalyticsEvent[];
} {
	const analyticsEvents: ReadyAnalyticsEvent[] = [];
	return {
		env: {
			CONFIG: { account_id: 123, script_id: 456 },
			COLO_METADATA: {
				coloId: 1,
				metalId: 2,
				coloTier: 1,
				coloRegion: "WEUR",
			},
			VERSION_METADATA: { tag: "v1" },
			ANALYTICS: {
				logEvent(event: ReadyAnalyticsEvent) {
					analyticsEvents.push(event);
				},
			},
			...overrides,
		} as Env,
		analyticsEvents,
	};
}

// ============================================================
// lookupCohort tests
// ============================================================

describe("lookupCohort", () => {
	it("returns cohort on success", async ({ expect }) => {
		const lookupMock = vi.fn().mockResolvedValue({
			ok: true,
			result: "ent",
			meta: { workersVersion: "test" },
		});

		const result = await lookupCohort(
			{ lookupAccountCohort: lookupMock } as AccountCohortQuerierBinding,
			42
		);

		expect(result).toBe("ent");
		expect(lookupMock).toHaveBeenCalledWith("42");
	});

	it("returns null when binding is unavailable", async ({ expect }) => {
		const result = await lookupCohort(undefined, 42);
		expect(result).toBeNull();
	});

	it("returns null when accountId is undefined", async ({ expect }) => {
		const result = await lookupCohort(
			{
				lookupAccountCohort: () =>
					Promise.resolve({
						ok: true as const,
						result: "ent",
						meta: { workersVersion: "test" },
					}),
			},
			undefined
		);
		expect(result).toBeNull();
	});

	it("returns null on RPC failure", async ({ expect }) => {
		const result = await lookupCohort(
			{
				lookupAccountCohort: () => Promise.reject(new Error("rpc broke")),
			},
			42
		);
		expect(result).toBeNull();
	});

	it("returns null when ok:false", async ({ expect }) => {
		const result = await lookupCohort(
			{
				lookupAccountCohort: () =>
					Promise.resolve({
						ok: false as const,
						errors: [
							{ name: "Error", message: "invalid account", code: "ERR" },
						],
					}),
			},
			42
		);
		expect(result).toBeNull();
	});

	it("returns null when result is null (cold cache)", async ({ expect }) => {
		const result = await lookupCohort(
			{
				lookupAccountCohort: () =>
					Promise.resolve({
						ok: true as const,
						result: null,
						meta: { workersVersion: "test" },
					}),
			},
			42
		);
		expect(result).toBeNull();
	});

	it("times out after COHORT_LOOKUP_TIMEOUT_MS", async ({ expect }) => {
		const result = await lookupCohort(
			{
				lookupAccountCohort: () =>
					new Promise((resolve) => {
						setTimeout(
							() =>
								resolve({
									ok: true as const,
									result: "ent",
									meta: { workersVersion: "test" },
								}),
							COHORT_LOOKUP_TIMEOUT_MS * 2
						);
					}),
			},
			42
		);
		expect(result).toBeNull();
	});
});

// ============================================================
// Gateway (outer entrypoint) tests
// ============================================================

describe("gateway (outer entrypoint)", () => {
	it("passes cohort through ctx.version to inner", async ({ expect }) => {
		const capturedOptions: InnerEntrypointOptions[] = [];
		const ctx = createGatewayCtx(
			async () => new Response("ok"),
			capturedOptions
		);
		const { env } = createGatewayEnv({
			ACCOUNT_COHORT_QUERIER: {
				lookupAccountCohort: () =>
					Promise.resolve({
						ok: true as const,
						result: "ent",
						meta: { workersVersion: "test" },
					}),
			},
		});

		await routerWorker.fetch(new Request("https://example.com"), env, ctx);

		expect(capturedOptions).toHaveLength(1);
		expect(capturedOptions[0].version).toEqual({ cohort: "ent" });
	});

	it("does not pass version when cohort is null", async ({ expect }) => {
		const capturedOptions: InnerEntrypointOptions[] = [];
		const ctx = createGatewayCtx(
			async () => new Response("ok"),
			capturedOptions
		);
		// No ACCOUNT_COHORT_QUERIER — lookupCohort returns null
		const { env } = createGatewayEnv();

		await routerWorker.fetch(new Request("https://example.com"), env, ctx);

		expect(capturedOptions).toHaveLength(1);
		expect(capturedOptions[0].version).toBeUndefined();
	});

	it("writes entrypoint = Outer and cohort in analytics", async ({
		expect,
	}) => {
		const ctx = createGatewayCtx(async () => new Response("ok"));
		const { env, analyticsEvents } = createGatewayEnv({
			ACCOUNT_COHORT_QUERIER: {
				lookupAccountCohort: () =>
					Promise.resolve({
						ok: true as const,
						result: "ent",
						meta: { workersVersion: "test" },
					}),
			},
		});

		await routerWorker.fetch(new Request("https://example.com"), env, ctx);

		expect(analyticsEvents).toHaveLength(1);
		expect(analyticsEvents[0].doubles?.[9]).toBe(EntrypointType.Outer);
		expect(analyticsEvents[0].blobs?.[8]).toBe("ent");
	});

	it("does not set error blob for user worker errors", async ({ expect }) => {
		const userError = new Error("user code bug");
		const ctx = createGatewayCtx(async () => {
			throw userError;
		});
		const { env, analyticsEvents } = createGatewayEnv();

		await expect(
			routerWorker.fetch(new Request("https://example.com"), env, ctx)
		).rejects.toThrow(userError);

		expect(analyticsEvents).toHaveLength(1);
		// blob3 (error) should not be set for user worker errors
		expect(analyticsEvents[0].blobs?.[2]).toBeUndefined();
	});

	it("sets error blob for platform errors from inner", async ({ expect }) => {
		const platformError = new RouterPlatformError(
			new Error("platform boom")
		);
		const ctx = createGatewayCtx(async () => {
			throw platformError;
		});
		const { env, analyticsEvents } = createGatewayEnv();

		await expect(
			routerWorker.fetch(new Request("https://example.com"), env, ctx)
		).rejects.toThrow(RouterPlatformError);

		expect(analyticsEvents).toHaveLength(1);
		expect(analyticsEvents[0].blobs?.[2]).toBe("platform boom");
	});

	it("sets error blob for outer-originated errors", async ({ expect }) => {
		const ctx = {
			exports: {
				RouterInnerEntrypoint() {
					throw new Error("export setup failed");
				},
			},
			waitUntil() {},
			passThroughOnException() {},
		} as unknown as ExecutionContext;
		const { env, analyticsEvents } = createGatewayEnv();

		await expect(
			routerWorker.fetch(new Request("https://example.com"), env, ctx)
		).rejects.toThrow("export setup failed");

		expect(analyticsEvents).toHaveLength(1);
		expect(analyticsEvents[0].blobs?.[2]).toBe("export setup failed");
	});
});

// ============================================================
// Inner entrypoint analytics tests
// ============================================================

describe("inner entrypoint analytics", () => {
	it("writes entrypoint = Inner and cohort from ctx.version", async ({
		expect,
	}) => {
		const analyticsEvents: ReadyAnalyticsEvent[] = [];
		const request = new Request("https://example.com");
		const ctx = Object.assign(createExecutionContext(), {
			version: { cohort: "ent" },
		});

		const env = {
			CONFIG: {
				has_user_worker: false,
				account_id: 123,
				script_id: 456,
			},
			COLO_METADATA: {
				coloId: 1,
				metalId: 2,
				coloTier: 1,
				coloRegion: "WEUR",
			},
			VERSION_METADATA: { tag: "v1" },
			ANALYTICS: {
				logEvent(event: ReadyAnalyticsEvent) {
					analyticsEvents.push(event);
				},
			},
			ASSET_WORKER: {
				async fetch() {
					return new Response("ok");
				},
				async unstable_canFetch() {
					return true;
				},
			},
		} as unknown as Env;

		await fetchFromInnerEntrypoint(request, env, ctx);

		expect(analyticsEvents).toHaveLength(1);
		expect(analyticsEvents[0].doubles?.[9]).toBe(EntrypointType.Inner);
		expect(analyticsEvents[0].blobs?.[8]).toBe("ent");
	});

	it("writes cohort as 'unknown' when ctx.version has no cohort", async ({
		expect,
	}) => {
		const analyticsEvents: ReadyAnalyticsEvent[] = [];
		const request = new Request("https://example.com");
		const ctx = createExecutionContext();

		const env = {
			CONFIG: {
				has_user_worker: false,
				account_id: 123,
				script_id: 456,
			},
			COLO_METADATA: {
				coloId: 1,
				metalId: 2,
				coloTier: 1,
				coloRegion: "WEUR",
			},
			VERSION_METADATA: { tag: "v1" },
			ANALYTICS: {
				logEvent(event: ReadyAnalyticsEvent) {
					analyticsEvents.push(event);
				},
			},
			ASSET_WORKER: {
				async fetch() {
					return new Response("ok");
				},
				async unstable_canFetch() {
					return true;
				},
			},
		} as unknown as Env;

		await fetchFromInnerEntrypoint(request, env, ctx);

		expect(analyticsEvents).toHaveLength(1);
		expect(analyticsEvents[0].doubles?.[9]).toBe(EntrypointType.Inner);
		expect(analyticsEvents[0].blobs?.[8]).toBe("unknown");
	});
});
