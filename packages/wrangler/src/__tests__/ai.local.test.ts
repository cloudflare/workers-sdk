import { COMPLIANCE_REGION_CONFIG_UNKNOWN } from "@cloudflare/workers-utils";
import { Request } from "miniflare";
import { Headers, Response } from "undici";
import { afterEach, describe, expect, it, vi } from "vitest";
import * as internal from "../cfetch/internal";
import { getAIFetcher } from "../commands/ai/fetcher";
import * as user from "../user";

const AIFetcher = getAIFetcher(COMPLIANCE_REGION_CONFIG_UNKNOWN);

describe("ai", () => {
	describe("fetcher", () => {
		afterEach(() => {
			vi.restoreAllMocks();
		});

		describe("local", () => {
			it("should send x-forwarded header", async () => {
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

			it("account id should be set", async () => {
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
	});
});
