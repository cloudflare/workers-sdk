import { mkdirSync, writeFileSync } from "node:fs";
import readline from "node:readline";
import { runInTempDir } from "@cloudflare/workers-utils/test-helpers";
import { http, HttpResponse } from "msw";
import { afterEach, beforeEach, describe, test, vi } from "vitest";
import { mockAccountId, mockApiToken } from "./helpers/mock-account-id";
import { mockConsoleMethods } from "./helpers/mock-console";
import { clearDialogs, mockConfirm, mockPrompt } from "./helpers/mock-dialogs";
import { useMockIsTTY } from "./helpers/mock-istty";
import { useMockStdin } from "./helpers/mock-stdin";
import { msw } from "./helpers/msw";
import { runWrangler } from "./helpers/run-wrangler";

type PreviewBaseConfigPatchBody = {
	previews_base_config?: {
		env?: Record<string, { type: string; text: string } | null>;
	};
};

type PreviewBaseConfigWorkerResult = {
	previews_base_config?: {
		env?: Record<string, { type: string; text: string }>;
	};
	preview_defaults?: {
		env?: Record<string, { type: string; text: string }>;
	};
};

function mockPatchWorker(
	onRequest?: (info: {
		url: string;
		contentType: string | null;
		body: PreviewBaseConfigPatchBody;
	}) => void
) {
	msw.use(
		http.patch(
			`*/accounts/:accountId/workers/workers/:workerId`,
			async ({ request }) => {
				onRequest?.({
					url: request.url,
					contentType: request.headers.get("content-type"),
					body: (await request.json()) as PreviewBaseConfigPatchBody,
				});
				return HttpResponse.json({ success: true, result: {} });
			}
		)
	);
}

function mockGetWorker(
	env: Record<string, { type: string; text: string }>,
	onRequest?: (info: { url: string }) => void
) {
	mockGetWorkerResult({ previews_base_config: { env } }, onRequest);
}

function mockGetWorkerResult(
	result: PreviewBaseConfigWorkerResult,
	onRequest?: (info: { url: string }) => void
) {
	msw.use(
		http.get(
			`*/accounts/:accountId/workers/workers/:workerId`,
			({ request }) => {
				onRequest?.({ url: request.url });
				return HttpResponse.json({
					success: true,
					result,
				});
			}
		)
	);
}

function mockReadlineInput(input: string) {
	vi.spyOn(readline, "createInterface").mockImplementation(
		() => input.split(/\r?\n/) as unknown as readline.Interface
	);
}

describe("wrangler preview", () => {
	const std = mockConsoleMethods();
	runInTempDir();
	mockApiToken();
	mockAccountId();

	describe("preview base-config secret", () => {
		beforeEach(() => {
			mkdirSync("src", { recursive: true });
			writeFileSync(
				"src/index.ts",
				"export default { fetch() { return new Response('ok'); } };"
			);
			writeFileSync(
				"wrangler.json",
				JSON.stringify({
					name: "test-worker",
					main: "src/index.ts",
					compatibility_date: "2025-01-01",
				})
			);
			msw.resetHandlers();
		});

		afterEach(() => {
			clearDialogs();
			vi.unstubAllEnvs();
		});

		test.for([
			{ command: "put API_KEY", flag: "--name my-preview" },
			{ command: "put API_KEY", flag: '--message "add secret"' },
			{ command: "put API_KEY", flag: "--tag v1" },
			{ command: "put API_KEY", flag: "--ignore-base-config" },
			{ command: "delete REMOVE_ME", flag: "--name my-preview" },
			{ command: "delete REMOVE_ME", flag: '--message "delete secret"' },
			{ command: "delete REMOVE_ME", flag: "--tag v1" },
			{ command: "delete REMOVE_ME", flag: "--ignore-base-config" },
			{ command: "list", flag: "--name my-preview" },
			{ command: "list", flag: '--message "list secrets"' },
			{ command: "list", flag: "--tag v1" },
			{ command: "list", flag: "--ignore-base-config" },
			{ command: "bulk", flag: "--name my-preview" },
			{ command: "bulk", flag: '--message "bulk secrets"' },
			{ command: "bulk", flag: "--tag v1" },
			{ command: "bulk", flag: "--ignore-base-config" },
		])(
			"rejects Preview deployment flag $flag for $command",
			async ({ command, flag }, { expect }) => {
				let requested = false;
				mockPatchWorker(() => {
					requested = true;
				});
				mockGetWorker({}, () => {
					requested = true;
				});

				await expect(
					runWrangler(`preview base-config secret ${command} ${flag}`)
				).rejects.toThrow(/Unknown argument/);
				expect(requested).toBe(false);
			}
		);

		test("does not inherit the preview script positional", async ({
			expect,
		}) => {
			await expect(
				runWrangler("preview base-config secret put")
			).rejects.toThrow(/Not enough non-option arguments/);
			expect(std.out).toContain(
				"wrangler preview base-config secret put <key>"
			);
			expect(std.out).not.toContain(
				"script  The path to an entry point for your Worker"
			);
		});

		describe("put", () => {
			const mockStdIn = useMockStdin({ isTTY: false });

			test("patches the base config with the secret", async ({ expect }) => {
				mockStdIn.send("base-config-secret");
				let requestUrl: string | undefined;
				let contentType: string | null | undefined;
				let requestBody: PreviewBaseConfigPatchBody | undefined;
				mockPatchWorker(({ url, contentType: ct, body }) => {
					requestUrl = url;
					contentType = ct;
					requestBody = body;
				});

				await runWrangler("preview base-config secret put API_KEY");

				expect(requestUrl).toContain("/workers/workers/test-worker");
				expect(requestUrl).not.toContain("/previews/");
				expect(contentType).toBe("application/merge-patch+json");
				expect(requestBody).toEqual({
					previews_base_config: {
						env: {
							API_KEY: { type: "secret_text", text: "base-config-secret" },
						},
					},
				});
				expect(std.out).toContain("test-worker");
				expect(std.out).toContain("API_KEY");
				expect(std.out).toContain(
					'Creating the secret for the Preview base config on the Worker "test-worker"'
				);
				expect(std.out).toContain(
					'Updated Preview base config for the Worker "test-worker" with secret API_KEY.'
				);
				expect(std.out).not.toContain("base-config-secret");
			});

			describe("(interactive)", () => {
				const { setIsTTY } = useMockIsTTY();

				test("reads the secret from a masked prompt", async ({ expect }) => {
					setIsTTY(true);
					mockPrompt({
						text: "Enter a secret value:",
						options: { isSecret: true },
						result: "prompt-secret",
					});
					let requestBody: PreviewBaseConfigPatchBody | undefined;
					mockPatchWorker(({ body }) => {
						requestBody = body;
					});

					await runWrangler("preview base-config secret put API_KEY");

					expect(requestBody).toEqual({
						previews_base_config: {
							env: {
								API_KEY: { type: "secret_text", text: "prompt-secret" },
							},
						},
					});
					expect(std.out).not.toContain("prompt-secret");
				});
			});

			test("respects env-specific worker name when using --env", async ({
				expect,
			}) => {
				mockStdIn.send("env-secret");
				writeFileSync(
					"wrangler.json",
					JSON.stringify({
						name: "top-worker",
						main: "src/index.ts",
						compatibility_date: "2025-01-01",
						env: { staging: { name: "staging-worker" } },
					})
				);
				let requestUrl: string | undefined;
				mockPatchWorker(({ url }) => {
					requestUrl = url;
				});

				await runWrangler(
					"preview base-config secret put API_KEY --env staging"
				);

				expect(requestUrl).toContain("/workers/workers/staging-worker");
			});

			test("supports --worker-name", async ({ expect }) => {
				mockStdIn.send("override-secret");
				let requestUrl: string | undefined;
				mockPatchWorker(({ url }) => {
					requestUrl = url;
				});

				await runWrangler(
					"preview base-config secret put API_KEY --worker-name override-worker"
				);

				expect(requestUrl).toContain("/workers/workers/override-worker");
			});

			test("fails before making API calls when Worker name is missing", async ({
				expect,
			}) => {
				mockStdIn.send("base-config-secret");
				writeFileSync(
					"wrangler.json",
					JSON.stringify({
						main: "src/index.ts",
						compatibility_date: "2025-01-01",
					})
				);
				let requested = false;
				mockPatchWorker(() => {
					requested = true;
				});

				await expect(
					runWrangler("preview base-config secret put API_KEY")
				).rejects.toThrow(/Required Worker name missing/);
				expect(requested).toBe(false);
			});
		});

		describe("delete", () => {
			const { setIsTTY } = useMockIsTTY();

			test("patches the base config removing the secret", async ({
				expect,
			}) => {
				let requestUrl: string | undefined;
				let contentType: string | null | undefined;
				let requestBody: PreviewBaseConfigPatchBody | undefined;
				mockPatchWorker(({ url, contentType: ct, body }) => {
					requestUrl = url;
					contentType = ct;
					requestBody = body;
				});

				await runWrangler(
					"preview base-config secret delete REMOVE_ME --skip-confirmation"
				);

				expect(requestUrl).toContain("/workers/workers/test-worker");
				expect(contentType).toBe("application/merge-patch+json");
				expect(requestBody).toEqual({
					previews_base_config: { env: { REMOVE_ME: null } },
				});
				expect(std.out).toContain("REMOVE_ME");
				expect(std.out).toContain("test-worker");
				expect(std.out).toContain(
					"Deleting the secret REMOVE_ME on the Preview base config for the Worker test-worker"
				);
				expect(std.out).toContain(
					'Updated Preview base config for the Worker "test-worker" with deleted secret REMOVE_ME.'
				);
			});

			test("confirms before deleting a secret interactively", async ({
				expect,
			}) => {
				setIsTTY(true);
				mockConfirm({
					text: "Are you sure you want to permanently delete the secret REMOVE_ME on the Preview base config for the Worker test-worker?",
					result: true,
				});
				let requestBody: PreviewBaseConfigPatchBody | undefined;
				mockPatchWorker(({ body }) => {
					requestBody = body;
				});

				await runWrangler("preview base-config secret delete REMOVE_ME");

				expect(requestBody).toEqual({
					previews_base_config: { env: { REMOVE_ME: null } },
				});
			});

			test("makes no API call when the user declines confirmation", async ({
				expect,
			}) => {
				setIsTTY(true);
				mockConfirm({
					text: "Are you sure you want to permanently delete the secret REMOVE_ME on the Preview base config for the Worker test-worker?",
					result: false,
				});
				let requested = false;
				mockPatchWorker(() => {
					requested = true;
				});

				await runWrangler("preview base-config secret delete REMOVE_ME");

				expect(requested).toBe(false);
				expect(std.out).not.toContain("Deleting the secret REMOVE_ME");
			});

			test("respects env-specific worker name when deleting a secret", async ({
				expect,
			}) => {
				writeFileSync(
					"wrangler.json",
					JSON.stringify({
						name: "top-worker",
						main: "src/index.ts",
						compatibility_date: "2025-01-01",
						env: { staging: { name: "staging-worker" } },
					})
				);
				let requestUrl: string | undefined;
				mockPatchWorker(({ url }) => {
					requestUrl = url;
				});

				await runWrangler(
					"preview base-config secret delete REMOVE_ME --env staging --skip-confirmation"
				);

				expect(requestUrl).toContain("/workers/workers/staging-worker");
			});

			test("supports --worker-name when deleting a secret", async ({
				expect,
			}) => {
				let requestUrl: string | undefined;
				mockPatchWorker(({ url }) => {
					requestUrl = url;
				});

				await runWrangler(
					"preview base-config secret delete REMOVE_ME --worker-name override-worker --skip-confirmation"
				);

				expect(requestUrl).toContain("/workers/workers/override-worker");
			});
		});

		describe("list", () => {
			test("reads the base config", async ({ expect }) => {
				let requestUrl: string | undefined;
				mockGetWorker({}, ({ url }) => {
					requestUrl = url;
				});

				await runWrangler("preview base-config secret list --json");

				expect(requestUrl).toContain("/workers/workers/test-worker");
				expect(requestUrl).not.toContain("/previews/");
			});

			// Matrix over output format (json vs. pretty). In every combination we
			// only list secret bindings (never plain_text) and never print the value.
			test.for([
				{
					name: "json, value provided",
					json: true,
					text: "super-secret-value",
				},
				{
					name: "pretty, value provided",
					json: false,
					text: "super-secret-value",
				},
			])(
				"lists only secrets and never leaks their values ($name)",
				async ({ json, text }, { expect }) => {
					mockGetWorker({
						MY_SECRET: { type: "secret_text", text },
						PLAIN: { type: "plain_text", text: "not-a-secret" },
					});

					await runWrangler(
						`preview base-config secret list ${json ? "--json" : ""}`
					);

					expect(std.out).toContain("MY_SECRET");
					expect(std.out).not.toContain("PLAIN");
					expect(std.out).not.toContain("not-a-secret");
					expect(std.out).not.toContain("super-secret-value");
					if (json) {
						expect(std.out).toContain('"name": "MY_SECRET"');
						expect(std.out).toContain('"type": "secret_text"');
					} else {
						expect(std.out).toContain("Worker: test-worker");
						expect(std.out).toContain("Preview base config");
						expect(std.out).toContain("Secrets");
						expect(std.out).toContain("********");
					}
				}
			);

			test("shows (none) when the base config has no secrets", async ({
				expect,
			}) => {
				mockGetWorker({});

				await runWrangler("preview base-config secret list");

				expect(std.out).toContain("(none)");
			});

			test("does not fall back to preview defaults when base config is missing", async ({
				expect,
			}) => {
				mockGetWorkerResult({
					preview_defaults: {
						env: {
							DEFAULT_SECRET: {
								type: "secret_text",
								text: "preview-default-secret",
							},
						},
					},
				});

				await runWrangler("preview base-config secret list");

				expect(std.out).toContain("(none)");
				expect(std.out).not.toContain("DEFAULT_SECRET");
				expect(std.out).not.toContain("preview-default-secret");
			});

			test("respects env-specific worker name when listing secrets", async ({
				expect,
			}) => {
				writeFileSync(
					"wrangler.json",
					JSON.stringify({
						name: "top-worker",
						main: "src/index.ts",
						compatibility_date: "2025-01-01",
						env: { staging: { name: "staging-worker" } },
					})
				);
				let requestUrl: string | undefined;
				mockGetWorker({}, ({ url }) => {
					requestUrl = url;
				});

				await runWrangler("preview base-config secret list --env staging");

				expect(requestUrl).toContain("/workers/workers/staging-worker");
			});

			test("supports --worker-name when listing secrets", async ({
				expect,
			}) => {
				let requestUrl: string | undefined;
				mockGetWorker({}, ({ url }) => {
					requestUrl = url;
				});

				await runWrangler(
					"preview base-config secret list --worker-name override-worker"
				);

				expect(requestUrl).toContain("/workers/workers/override-worker");
			});
		});

		describe("bulk", () => {
			test("patches the base config with all secrets", async ({ expect }) => {
				writeFileSync("secrets.env", "FIRST_KEY=one\nSECOND_KEY=two\n");
				let requestUrl: string | undefined;
				let requestBody: PreviewBaseConfigPatchBody | undefined;
				mockPatchWorker(({ url, body }) => {
					requestUrl = url;
					requestBody = body;
				});

				await runWrangler("preview base-config secret bulk secrets.env");

				expect(requestUrl).toContain("/workers/workers/test-worker");
				expect(requestBody).toEqual({
					previews_base_config: {
						env: {
							FIRST_KEY: { type: "secret_text", text: "one" },
							SECOND_KEY: { type: "secret_text", text: "two" },
						},
					},
				});
				expect(std.out).toContain(
					"Successfully created secret for key: FIRST_KEY"
				);
				expect(std.out).toContain(
					"Successfully created secret for key: SECOND_KEY"
				);
				expect(std.out).toContain(
					'Processing the secrets for the Preview base config on the Worker "test-worker"'
				);
				expect(std.out).toContain("with 2 created and 0 deleted secrets");
				expect(std.out).toContain(
					'Updated Preview base config for the Worker "test-worker" with 2 created and 0 deleted secrets.'
				);
				expect(std.out).not.toContain("one");
				expect(std.out).not.toContain("two");
			});

			test("creates secrets for empty dotenv values", async ({ expect }) => {
				writeFileSync(
					"secrets.env",
					'KEEP_ME=value\nREMOVE_ME=\nALSO_GONE=""\n'
				);
				let requestBody: PreviewBaseConfigPatchBody | undefined;
				mockPatchWorker(({ body }) => {
					requestBody = body;
				});

				await runWrangler("preview base-config secret bulk secrets.env");

				expect(requestBody).toEqual({
					previews_base_config: {
						env: {
							KEEP_ME: { type: "secret_text", text: "value" },
							REMOVE_ME: { type: "secret_text", text: "" },
							ALSO_GONE: { type: "secret_text", text: "" },
						},
					},
				});
				expect(std.out).toContain(
					"Successfully created secret for key: KEEP_ME"
				);
				expect(std.out).toContain(
					"Successfully created secret for key: REMOVE_ME"
				);
				expect(std.out).toContain(
					"Successfully created secret for key: ALSO_GONE"
				);
				expect(std.out).toContain("with 3 created and 0 deleted secrets");
			});

			test("uploads JSON secrets from stdin", async ({ expect }) => {
				mockReadlineInput(
					JSON.stringify({
						FIRST_KEY: "one",
						SECOND_KEY: "two",
					})
				);
				let requestBody: PreviewBaseConfigPatchBody | undefined;
				mockPatchWorker(({ body }) => {
					requestBody = body;
				});

				await runWrangler("preview base-config secret bulk");

				expect(requestBody).toEqual({
					previews_base_config: {
						env: {
							FIRST_KEY: { type: "secret_text", text: "one" },
							SECOND_KEY: { type: "secret_text", text: "two" },
						},
					},
				});
				expect(std.out).toContain("with 2 created and 0 deleted secrets");
				expect(std.out).not.toContain("one");
				expect(std.out).not.toContain("two");
			});

			test("uploads dotenv secrets from stdin", async ({ expect }) => {
				mockReadlineInput("FIRST_KEY=one\nSECOND_KEY=two");
				let requestBody: PreviewBaseConfigPatchBody | undefined;
				mockPatchWorker(({ body }) => {
					requestBody = body;
				});

				await runWrangler("preview base-config secret bulk");

				expect(requestBody).toEqual({
					previews_base_config: {
						env: {
							FIRST_KEY: { type: "secret_text", text: "one" },
							SECOND_KEY: { type: "secret_text", text: "two" },
						},
					},
				});
				expect(std.out).toContain("with 2 created and 0 deleted secrets");
				expect(std.out).not.toContain("one");
				expect(std.out).not.toContain("two");
			});

			test("respects env-specific worker name when bulk uploading secrets", async ({
				expect,
			}) => {
				writeFileSync("secrets.env", "API_KEY=one\n");
				writeFileSync(
					"wrangler.json",
					JSON.stringify({
						name: "top-worker",
						main: "src/index.ts",
						compatibility_date: "2025-01-01",
						env: { staging: { name: "staging-worker" } },
					})
				);
				let requestUrl: string | undefined;
				mockPatchWorker(({ url }) => {
					requestUrl = url;
				});

				await runWrangler(
					"preview base-config secret bulk secrets.env --env staging"
				);

				expect(requestUrl).toContain("/workers/workers/staging-worker");
			});

			test("supports --worker-name when bulk uploading secrets", async ({
				expect,
			}) => {
				writeFileSync("secrets.env", "API_KEY=one\n");
				let requestUrl: string | undefined;
				mockPatchWorker(({ url }) => {
					requestUrl = url;
				});

				await runWrangler(
					"preview base-config secret bulk secrets.env --worker-name override-worker"
				);

				expect(requestUrl).toContain("/workers/workers/override-worker");
			});

			test("deletes secrets for null values, like `wrangler secret bulk`", async ({
				expect,
			}) => {
				writeFileSync(
					"secrets.json",
					JSON.stringify({ KEEP_ME: "value", REMOVE_ME: null, ALSO_GONE: null })
				);
				let requestBody: PreviewBaseConfigPatchBody | undefined;
				mockPatchWorker(({ body }) => {
					requestBody = body;
				});

				await runWrangler("preview base-config secret bulk secrets.json");

				expect(requestBody).toEqual({
					previews_base_config: {
						env: {
							KEEP_ME: { type: "secret_text", text: "value" },
							REMOVE_ME: null,
							ALSO_GONE: null,
						},
					},
				});
				expect(std.out).toContain(
					"Successfully created secret for key: KEEP_ME"
				);
				expect(std.out).toContain(
					"Successfully deleted secret for key: REMOVE_ME"
				);
				expect(std.out).toContain(
					"Successfully deleted secret for key: ALSO_GONE"
				);
				expect(std.out).toContain("with 1 created and 2 deleted secrets");
			});

			test("patches an empty env for empty input", async ({ expect }) => {
				writeFileSync("secrets.json", JSON.stringify({}));
				let requestBody: PreviewBaseConfigPatchBody | undefined;
				mockPatchWorker(({ body }) => {
					requestBody = body;
				});

				await runWrangler("preview base-config secret bulk secrets.json");

				expect(requestBody).toEqual({
					previews_base_config: { env: {} },
				});
				expect(std.out).toContain("with 0 created and 0 deleted secrets");
			});

			test("makes no API call when there is no input", async ({ expect }) => {
				let requested = false;
				mockPatchWorker(() => {
					requested = true;
				});
				vi.spyOn(readline, "createInterface").mockImplementation(
					() => null as unknown as readline.Interface
				);

				await runWrangler("preview base-config secret bulk");

				expect(requested).toBe(false);
				expect(std.err).toContain(
					"🚨 No content found in file, or piped input."
				);
			});
		});
	});
});
