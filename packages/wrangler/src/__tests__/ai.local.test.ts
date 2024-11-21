import { Request } from "miniflare";
import { HttpResponse } from "msw";
import { AIFetcher } from "../ai/fetcher";
import * as internal from "../cfetch/internal";
import * as user from "../user";
import type { RequestInit } from "undici";

describe("ai", () => {
	describe("fetcher", () => {
		afterEach(() => {
			vi.restoreAllMocks();
		});

		describe("local", () => {
			it("should send x-forwarded-host header", async () => {
				vi.spyOn(user, "getAccountId").mockImplementation(async () => "123");
				vi.spyOn(internal, "performApiFetch").mockImplementation(
					async (resource: string, init: RequestInit = {}) => {
						const headers = new Headers(init.headers);
						return HttpResponse.json({
							xForwardedFor: headers.get("X-Forwarded-Host"),
							method: init.method,
						});
					}
				);

				const url = "http://internal.ai/ai/test/path?version=123";
				const resp = await AIFetcher(
					new Request(url, {
						method: "PATCH",
						headers: {
							"x-example": "test",
						},
					})
				);

				expect(await resp.json()).toEqual({
					xForwardedFor: url,
					method: "PATCH",
				});
			});

			it("account id should be set", async () => {
				vi.spyOn(user, "getAccountId").mockImplementation(async () => "123");
				vi.spyOn(internal, "performApiFetch").mockImplementation(
					async (resource: string) => {
						return HttpResponse.json({
							resource: resource,
						});
					}
				);

				const url = "http://internal.ai/ai/test/path?version=123";
				const resp = await AIFetcher(
					new Request(url, {
						method: "PATCH",
						headers: {
							"x-example": "test",
						},
					})
				);

				expect(await resp.json()).toEqual({
					resource: "/accounts/123/ai/run/proxy",
				});
			});
		});
	});
});
