import { runInTempDir } from "@cloudflare/workers-utils/test-helpers";
import { http, HttpResponse } from "msw";
import { describe, it, vi } from "vitest";
import { mockAccountId, mockApiToken } from "./helpers/mock-account-id";
import { mockConsoleMethods } from "./helpers/mock-console";
import { createFetchResult, msw } from "./helpers/msw";
import { runWrangler } from "./helpers/run-wrangler";

vi.mock("../wrangler-banner");

describe("durable-object namespace", () => {
	runInTempDir();
	mockAccountId();
	mockApiToken();
	const std = mockConsoleMethods();

	it("creates a SQLite-backed namespace in an internal region", async ({
		expect,
	}) => {
		let requestBody: unknown;

		msw.use(
			http.post(
				"*/accounts/:accountId/workers/durable_objects/namespaces",
				async ({ params, request }) => {
					expect(params.accountId).toBe("some-account-id");
					requestBody = await request.json();

					return HttpResponse.json(
						createFetchResult({
							id: "some-namespace-id",
							name: "dog-namespace",
						})
					);
				},
				{ once: true }
			)
		);

		await runWrangler(
			"durable-object namespace create dog-namespace " +
				"--script-name dog-worker --class-name Container --default-region DOG"
		);

		expect(requestBody).toEqual({
			name: "dog-namespace",
			script: "dog-worker",
			class: "Container",
			default_region: "dog",
			use_sqlite: true,
		});
		expect(std.out).toBe(
			'Created Durable Object namespace "dog-namespace" with ID ' +
				'"some-namespace-id" in region "dog"'
		);
		expect(std.err).toBe("");
		expect(std.warn).toBe("");
	});

	it("rejects unsupported internal regions", async ({ expect }) => {
		await expect(
			runWrangler(
				"durable-object namespace create test " +
					"--script-name worker --class-name Container --default-region wnam"
			)
		).rejects.toThrowErrorMatchingInlineSnapshot(
			`[Error: --default-region must be one of: dog, vet]`
		);
	});
});
