import { mkdir } from "node:fs/promises";
import { http, HttpResponse } from "msw";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { verifyWorkerMatchesCITag } from "../match-tag";
import { mockAccountId, mockApiToken } from "./helpers/mock-account-id";
import { mockConsoleMethods } from "./helpers/mock-console";
import { msw } from "./helpers/msw";
import { runInTempDir } from "./helpers/run-in-tmp";
import { runWrangler } from "./helpers/run-wrangler";
import { writeWorkerSource } from "./helpers/write-worker-source";
import { writeWranglerToml } from "./helpers/write-wrangler-toml";

describe("match-tag", () => {
	mockAccountId();
	mockApiToken();
	function mockWorker(workerName: string, tag: string) {
		const dummyWorker = {
			id: workerName,
			default_environment: {
				environment: "production",
				created_on: "1987-09-27",
				modified_on: "1987-09-27",
				script: {
					id: workerName,
					tag,
				},
			},
			created_on: "1987-09-27",
			modified_on: "1987-09-27",
		};
		msw.use(
			http.get(
				`*/accounts/:accountId/workers/services/:workerName`,
				({ params }) => {
					if (params.workerName === workerName) {
						return HttpResponse.json(
							{
								success: true,
								errors: [],
								messages: [],
								result: dummyWorker,
							},
							{ status: 200 }
						);
					} else if (params.workerName === "network-error-worker") {
						return HttpResponse.error();
					} else {
						return HttpResponse.json(
							{
								success: false,
								errors: [
									{
										code: 10090,
									},
								],
								messages: [],
							},
							{ status: 200 }
						);
					}
				},
				{ once: true }
			)
		);
	}
	describe("happy path", () => {
		it("throws no errors", async () => {
			vi.stubEnv("WRANGLER_CI_MATCH_TAG", "abc123");
			mockWorker("my-worker", "abc123");
			await expect(
				verifyWorkerMatchesCITag("some-account-id", "my-worker")
			).resolves.toBeUndefined();
		});

		it("ignores errors if no tag match provided", async () => {
			vi.stubEnv("WRANGLER_CI_MATCH_TAG", "");
			mockWorker("network-error-worker", "abc123");
			await expect(
				verifyWorkerMatchesCITag("some-account-id", "my-worker")
			).resolves.toBeUndefined();
		});
	});

	describe("error cases", () => {
		it("catches worker not found from API and throws validation error", async () => {
			vi.stubEnv("WRANGLER_CI_MATCH_TAG", "abc123");
			mockWorker("a-worker", "abc123");
			await expect(
				verifyWorkerMatchesCITag("some-account-id", "b-worker")
			).rejects.toMatchInlineSnapshot(
				`[Error: The name in \`wrangler.toml\` (b-worker) must match the name of your Worker. Please update the name field in your wrangler.toml.]`
			);
		});

		it("catches all other API errors and throws generic validation error", async () => {
			vi.stubEnv("WRANGLER_CI_MATCH_TAG", "abc123");
			mockWorker("a-worker", "abc123");
			await expect(
				verifyWorkerMatchesCITag("some-account-id", "network-error-worker")
			).rejects.toMatchInlineSnapshot(
				`[Error: Wrangler cannot validate that your Worker name matches what is expected by the build system. Please retry the build.]`
			);
		});

		it("throws validation error if tag mismatches", async () => {
			vi.stubEnv("WRANGLER_CI_MATCH_TAG", "abc123a");
			mockWorker("my-worker", "abc123b");
			await expect(
				verifyWorkerMatchesCITag("some-account-id", "my-worker")
			).rejects.toMatchInlineSnapshot(
				`[Error: The name in \`wrangler.toml\` (my-worker) must match the name of your Worker. Please update the name field in your wrangler.toml.]`
			);
		});

		it("throws validation error if account_id mismatches", async () => {
			vi.stubEnv("WRANGLER_CI_MATCH_TAG", "abc123a");
			vi.stubEnv("CLOUDFLARE_ACCOUNT_ID", "some-other-account-id");
			mockWorker("my-worker", "abc123b");
			await expect(
				verifyWorkerMatchesCITag("some-account-id", "my-worker")
			).rejects.toMatchInlineSnapshot(
				`[Error: The \`account_id\` in \`wrangler.toml\` must match the \`account_id\` for this account. Please update your wrangler.toml with \`account_id = "some-other-account-id"\`]`
			);
		});

		describe("deploy", () => {
			mockConsoleMethods();
			runInTempDir();
			beforeEach(() => {
				writeWorkerSource();
			});
			it("catches worker not found from API and throws validation error", async () => {
				vi.stubEnv("WRANGLER_CI_MATCH_TAG", "abc123");
				mockWorker("a-worker", "abc123");
				writeWranglerToml({ name: "b-worker" });
				await expect(
					runWrangler("deploy ./index.js")
				).rejects.toMatchInlineSnapshot(
					`[Error: The name in \`wrangler.toml\` (b-worker) must match the name of your Worker. Please update the name field in your wrangler.toml.]`
				);
			});

			it("catches all other API errors and throws generic validation error", async () => {
				vi.stubEnv("WRANGLER_CI_MATCH_TAG", "abc123");
				mockWorker("a-worker", "abc123");
				writeWranglerToml({ name: "network-error-worker" });
				await expect(
					runWrangler("deploy ./index.js")
				).rejects.toMatchInlineSnapshot(
					`[Error: Wrangler cannot validate that your Worker name matches what is expected by the build system. Please retry the build.]`
				);
			});

			it("throws validation error if tag mismatches", async () => {
				vi.stubEnv("WRANGLER_CI_MATCH_TAG", "abc123a");
				mockWorker("my-worker", "abc123b");
				writeWranglerToml({ name: "my-worker" });
				await expect(
					runWrangler("deploy ./index.js")
				).rejects.toMatchInlineSnapshot(
					`[Error: The name in \`wrangler.toml\` (my-worker) must match the name of your Worker. Please update the name field in your wrangler.toml.]`
				);
			});
			it("throws validation error if account_id mismatches", async () => {
				vi.stubEnv("WRANGLER_CI_MATCH_TAG", "abc123a");
				vi.stubEnv("CLOUDFLARE_ACCOUNT_ID", "some-other-account-id");
				mockWorker("my-worker", "abc123a");
				writeWranglerToml({
					name: "my-worker",
					account_id: "some-account-id",
				});
				await expect(
					runWrangler("deploy ./index.js")
				).rejects.toMatchInlineSnapshot(
					`[Error: The \`account_id\` in \`wrangler.toml\` must match the \`account_id\` for this account. Please update your wrangler.toml with \`account_id = "some-other-account-id"\`]`
				);
			});

			it("throws validation error if account_id mismatches w/ custom wrangler.toml path", async () => {
				vi.stubEnv("WRANGLER_CI_MATCH_TAG", "abc123a");
				vi.stubEnv("CLOUDFLARE_ACCOUNT_ID", "some-other-account-id");
				mockWorker("my-worker", "abc123a");
				await mkdir("path");
				writeWranglerToml(
					{
						name: "my-worker",
						account_id: "some-account-id",
					},
					"path/config.toml"
				);
				await expect(
					runWrangler("deploy -c path/config.toml ./index.js")
				).rejects.toMatchInlineSnapshot(
					`[Error: The \`account_id\` in \`path/config.toml\` must match the \`account_id\` for this account. Please update your wrangler.toml with \`account_id = "some-other-account-id"\`]`
				);
			});
		});
	});
});
