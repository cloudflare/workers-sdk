import { http, HttpResponse } from "msw";
import { describe, it } from "vitest";
import {
	extractConcurrencyKeysSection,
	fetchConcurrencyKeyNames,
	renderConcurrencyKeyDeclaration,
	shouldTypeConcurrencyKeys,
} from "../type-generation/concurrency-keys";
import { msw } from "./helpers/msw";
import type { Config } from "@cloudflare/workers-utils";

const ACCOUNT_ID = "023e105f4ecef8ad9ca31a8372d0c353";
const KEYS_URL = "*/accounts/:accountId/workflows/concurrency";

function config(overrides: Partial<Config> = {}) {
	return {
		account_id: ACCOUNT_ID,
		name: "test-worker",
		workflows: [],
		exports: {},
		...overrides,
	} as Pick<Config, "account_id" | "name" | "workflows" | "exports">;
}

function page(
	names: string[],
	resultInfo = { total_count: names.length, total_pages: 1 }
) {
	return HttpResponse.json({
		success: true,
		errors: [],
		messages: [],
		result: names.map((name) => ({ id: name, name, limit: 1 })),
		result_info: { count: names.length, per_page: 100, ...resultInfo },
	});
}

describe("renderConcurrencyKeyDeclaration", () => {
	it("renders sorted, escaped names", ({ expect }) => {
		expect(
			renderConcurrencyKeyDeclaration([
				"warehouse-db",
				"payments-api",
				'quote"d',
				"back\\slash",
				"naïve-ключ",
			])
		).toBe(
			[
				"declare namespace Cloudflare {",
				"\tinterface GlobalProps {",
				"\t\tconcurrencyKeys:",
				'\t\t\t| "back\\\\slash"',
				'\t\t\t| "naïve-ключ"',
				'\t\t\t| "payments-api"',
				'\t\t\t| "quote\\"d"',
				'\t\t\t| "warehouse-db";',
				"\t}",
				"}",
			].join("\n")
		);
	});

	it("renders a single name inline", ({ expect }) => {
		expect(renderConcurrencyKeyDeclaration(["payments-api"])).toContain(
			'\t\tconcurrencyKeys: "payments-api";'
		);
	});
});

describe("shouldTypeConcurrencyKeys", () => {
	it("requires a pinned account and a Workflow defined by this Worker", ({
		expect,
	}) => {
		const workflow = {
			binding: "ORDERS",
			name: "orders",
			class_name: "OrderWorkflow",
		};
		expect(shouldTypeConcurrencyKeys(config({ workflows: [workflow] }))).toBe(
			true
		);
		expect(
			shouldTypeConcurrencyKeys(
				config({ workflows: [{ ...workflow, script_name: "test-worker" }] })
			)
		).toBe(true);
		expect(
			shouldTypeConcurrencyKeys(
				config({
					exports: {
						OrderWorkflow: { type: "workflow", name: "orders" },
					},
				} as Partial<Config>)
			)
		).toBe(true);
		expect(
			shouldTypeConcurrencyKeys(
				config({ workflows: [{ ...workflow, script_name: "other-worker" }] })
			)
		).toBe(false);
		expect(
			shouldTypeConcurrencyKeys(
				config({ account_id: undefined, workflows: [workflow] })
			)
		).toBe(false);
	});
});

describe("extractConcurrencyKeysSection", () => {
	const section = [
		`// Begin concurrency keys (account ${ACCOUNT_ID})`,
		renderConcurrencyKeyDeclaration(["payments-api"]),
		"// End concurrency keys",
	].join("\n");

	it("returns the section for the same account only", ({ expect }) => {
		const content = `interface Env {}\n${section}\n// Begin runtime types`;
		expect(extractConcurrencyKeysSection(content, ACCOUNT_ID)).toBe(section);
		expect(
			extractConcurrencyKeysSection(content, "another-account")
		).toBeUndefined();
		expect(
			extractConcurrencyKeysSection(undefined, ACCOUNT_ID)
		).toBeUndefined();
	});
});

describe("fetchConcurrencyKeyNames", () => {
	const headers = { Authorization: "Bearer token" };

	it("follows every page", async ({ expect }) => {
		const names = Array.from({ length: 150 }, (_, i) => `key-${i}`);
		const info = { total_count: 150, total_pages: 2 };
		const pages: string[] = [];
		msw.use(
			http.get(KEYS_URL, ({ request }) => {
				const url = new URL(request.url);
				pages.push(url.searchParams.get("page") ?? "");
				expect(url.searchParams.get("per_page")).toBe("100");
				expect(request.headers.get("authorization")).toBe("Bearer token");
				expect(request.headers.get("user-agent")).toMatch(/^wrangler\//);
				return url.searchParams.get("page") === "1"
					? page(names.slice(0, 100), info)
					: page(names.slice(100), info);
			})
		);

		await expect(
			fetchConcurrencyKeyNames({}, ACCOUNT_ID, headers)
		).resolves.toEqual(names);
		expect(pages).toEqual(["1", "2"]);
	});

	it("rejects a listing shorter than the reported total", async ({
		expect,
	}) => {
		msw.use(
			http.get(KEYS_URL, () => page(["a"], { total_count: 2, total_pages: 1 }))
		);

		await expect(
			fetchConcurrencyKeyNames({}, ACCOUNT_ID, headers)
		).rejects.toThrow("returned 1 of 2 keys");
	});

	it("rejects a failed request", async ({ expect }) => {
		msw.use(
			http.get(KEYS_URL, () =>
				HttpResponse.json(
					{
						success: false,
						errors: [{ code: 10800, message: "user.feature_disabled" }],
						messages: [],
						result: null,
					},
					{ status: 403 }
				)
			)
		);

		await expect(
			fetchConcurrencyKeyNames({}, ACCOUNT_ID, headers)
		).rejects.toThrow("status 403");
	});
});
