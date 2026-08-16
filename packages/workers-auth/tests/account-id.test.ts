import { afterEach, beforeEach, describe, it, vi } from "vitest";
import { validateAccountId } from "../src/account-id";
import { getCloudflareAccountIdFromEnv } from "../src/env-vars";

describe("validateAccountId", () => {
	it("accepts alphanumeric characters, hyphens, and underscores", ({
		expect,
	}) => {
		for (const accountId of [
			"a4b3c2d1e0f9a8b7c6d5e4f3a2b1c0d9",
			"ACCOUNT-ID",
			"account_id",
			"0",
		]) {
			expect(validateAccountId(accountId, "in the test")).toBe(accountId);
		}
	});

	it("rejects values that cannot be used in an API URL", ({ expect }) => {
		for (const accountId of [
			"ваш-идентификатор-аккаунта",
			"account id",
			"\naccount-id",
			"account/id",
			"account:id",
			"",
		]) {
			expect(() => validateAccountId(accountId, "in the test")).toThrow(
				"Account IDs may only contain alphanumeric characters, hyphens, and underscores."
			);
		}
	});

	it("names the source of the invalid value", ({ expect }) => {
		expect(() =>
			validateAccountId("oh no", "set in the `SOME_VARIABLE` variable")
		).toThrowErrorMatchingInlineSnapshot(
			`[Error: Invalid account ID "oh no" set in the \`SOME_VARIABLE\` variable. Account IDs may only contain alphanumeric characters, hyphens, and underscores.]`
		);
	});
});

describe("getCloudflareAccountIdFromEnv", () => {
	beforeEach(() => {
		vi.unstubAllEnvs();
	});
	afterEach(() => {
		vi.unstubAllEnvs();
	});

	it("returns the value of CLOUDFLARE_ACCOUNT_ID", ({ expect }) => {
		vi.stubEnv("CLOUDFLARE_ACCOUNT_ID", "some-account-id");
		expect(getCloudflareAccountIdFromEnv()).toBe("some-account-id");
	});

	it("treats an empty value as unset", ({ expect }) => {
		vi.stubEnv("CLOUDFLARE_ACCOUNT_ID", "");
		expect(getCloudflareAccountIdFromEnv()).toBeUndefined();
	});

	it("throws for a value that cannot be used in an API URL", ({ expect }) => {
		vi.stubEnv("CLOUDFLARE_ACCOUNT_ID", "ваш-идентификатор-аккаунта");
		expect(getCloudflareAccountIdFromEnv).toThrowErrorMatchingInlineSnapshot(
			`[Error: Invalid account ID "ваш-идентификатор-аккаунта" set in the \`CLOUDFLARE_ACCOUNT_ID\` environment variable. Account IDs may only contain alphanumeric characters, hyphens, and underscores.]`
		);
	});
});
