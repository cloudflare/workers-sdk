import { COMPLIANCE_REGION_CONFIG_UNKNOWN } from "@cloudflare/workers-utils";
import { Request } from "miniflare";
import { Headers, Response } from "undici";
import { afterEach, describe, it, vi } from "vitest";
import { getAIFetcher } from "../ai/fetcher";
import * as internal from "../cfetch/internal";
import { logger } from "../logger";
import * as user from "../user";

const AIFetcher = getAIFetcher(COMPLIANCE_REGION_CONFIG_UNKNOWN);

describe("ai", () => {
	describe("fetcher", () => {
		afterEach(() => {
			vi.restoreAllMocks();
		});

		describe("local", () => {
			it("should send x-forwarded header", async ({ expect }) => {
				vi.spyOn(user, "getAccountId").mockImplementation(async () => "123");
				vi.spyOn(internal, "performApiFetch").mockImplementation(
					async (config, resource, init = {}) => {
						const headers = new Headers(init.headers);
						return Response.json({
							xForwarded: headers.get("X-Forwarded"),
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
					xForwarded: url,
					method: "PATCH",
				});
			});

			it("account id should be set", async ({ expect }) => {
				vi.spyOn(user, "getAccountId").mockImplementation(async () => "123");
				vi.spyOn(internal, "performApiFetch").mockImplementation(
					async (config, resource) => {
						return Response.json({
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

		describe("403 auth error handling", () => {
			it("should log error on 403 with auth error code 1031", async ({
				expect,
			}) => {
				vi.spyOn(user, "getAccountId").mockImplementation(async () => "123");
				vi.spyOn(internal, "performApiFetch").mockImplementation(async () => {
					return new Response(
						JSON.stringify({
							errors: [{ code: 1031, message: "Forbidden" }],
						}),
						{ status: 403 }
					);
				});
				const errorSpy = vi.spyOn(logger, "error");

				const resp = await AIFetcher(
					new Request("http://internal.ai/ai/test/path", { method: "POST" })
				);

				expect(resp.status).toBe(403);
				expect(errorSpy).toHaveBeenCalledWith(
					"Authentication error (code 1031): Your API token may have expired or lacks the required permissions. Please refresh your token by running `wrangler login`."
				);
			});

			it("should not log error on 403 without auth error code 1031", async ({
				expect,
			}) => {
				vi.spyOn(user, "getAccountId").mockImplementation(async () => "123");
				vi.spyOn(internal, "performApiFetch").mockImplementation(async () => {
					return new Response(
						JSON.stringify({
							errors: [{ code: 9999, message: "Other error" }],
						}),
						{ status: 403 }
					);
				});
				const errorSpy = vi.spyOn(logger, "error");

				const resp = await AIFetcher(
					new Request("http://internal.ai/ai/test/path", { method: "POST" })
				);

				expect(resp.status).toBe(403);
				expect(errorSpy).not.toHaveBeenCalled();
			});

			it("should not throw on 403 with unparseable body", async ({
				expect,
			}) => {
				vi.spyOn(user, "getAccountId").mockImplementation(async () => "123");
				vi.spyOn(internal, "performApiFetch").mockImplementation(async () => {
					return new Response("not json", { status: 403 });
				});
				const errorSpy = vi.spyOn(logger, "error");

				const resp = await AIFetcher(
					new Request("http://internal.ai/ai/test/path", { method: "POST" })
				);

				expect(resp.status).toBe(403);
				expect(errorSpy).not.toHaveBeenCalled();
			});
		});
	});
});
