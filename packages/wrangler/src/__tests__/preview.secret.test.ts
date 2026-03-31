import { mkdirSync, writeFileSync } from "node:fs";
import { http, HttpResponse } from "msw";
import { beforeEach, describe, test } from "vitest";
import { mockAccountId, mockApiToken } from "./helpers/mock-account-id";
import { mockConsoleMethods } from "./helpers/mock-console";
import { useMockStdin } from "./helpers/mock-stdin";
import { msw } from "./helpers/msw";
import { runInTempDir } from "./helpers/run-in-tmp";
import { runWrangler } from "./helpers/run-wrangler";

describe("wrangler preview", () => {
	const std = mockConsoleMethods();
	runInTempDir();
	mockApiToken();
	mockAccountId();
	describe("preview secret", () => {
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

		describe("put", () => {
			const mockStdIn = useMockStdin({ isTTY: false });

			test("should add a secret to Previews settings", async ({ expect }) => {
				mockStdIn.send("defaults-secret");
				let patchRequestBody:
					| {
							preview_defaults?: {
								env?: Record<string, { type: string; text?: string }>;
							};
					  }
					| undefined;
				msw.use(
					http.patch(
						`*/accounts/:accountId/workers/workers/:workerId`,
						async ({ request }) => {
							patchRequestBody =
								(await request.json()) as typeof patchRequestBody;
							return HttpResponse.json({
								success: true,
								result: {
									preview_defaults: {
										env: patchRequestBody?.preview_defaults?.env ?? {},
									},
								},
							});
						}
					)
				);
				await runWrangler(
					"preview secret put API_KEY --worker-name test-worker"
				);
				expect(patchRequestBody?.preview_defaults?.env?.API_KEY).toMatchObject({
					type: "secret_text",
					text: "defaults-secret",
				});
				expect(patchRequestBody?.preview_defaults?.env).toEqual({
					API_KEY: { type: "secret_text", text: "defaults-secret" },
				});
				expect(std.out).toContain(
					'Secret "API_KEY" added to Previews settings for Worker test-worker.'
				);
				expect(std.out).toContain("Worker: test-worker");
				expect(std.out).toContain("Previews settings");
				expect(std.out).toContain("Secrets");
				expect(std.out).toContain("API_KEY");
				expect(std.out).toContain("********");
			});

			test("should respect env-specific worker name when using --env", async ({
				expect,
			}) => {
				mockStdIn.send("env-secret");
				writeFileSync(
					"wrangler.json",
					JSON.stringify({
						name: "top-worker",
						main: "src/index.ts",
						compatibility_date: "2025-01-01",
						env: {
							staging: {
								name: "staging-worker",
							},
						},
					})
				);

				let patchUrl: string | undefined;

				msw.use(
					http.patch(
						`*/accounts/:accountId/workers/workers/:workerId`,
						({ request }) => {
							patchUrl = request.url;
							return HttpResponse.json({ success: true, result: {} });
						}
					)
				);

				await runWrangler("preview secret put API_KEY --env staging");

				expect(patchUrl).toContain("/workers/workers/staging-worker");
				expect(std.out).toContain(
					'Secret "API_KEY" added to Previews settings for Worker staging-worker.'
				);
			});

			test("should fail before making API calls when env-specific previews config is invalid", async ({
				expect,
			}) => {
				writeFileSync(
					"wrangler.json",
					JSON.stringify({
						name: "test-worker",
						main: "src/index.ts",
						compatibility_date: "2025-01-01",
						env: {
							staging: {
								previews: {
									browser: "not-an-object",
								},
							},
						},
					})
				);

				let requested = false;
				msw.use(
					http.patch(`*/accounts/:accountId/workers/workers/:workerId`, () => {
						requested = true;
						return HttpResponse.json({ success: true, result: {} });
					})
				);

				await expect(
					runWrangler("preview secret put API_KEY --env staging")
				).rejects.toThrow(/previews\.browser/);
				expect(requested).toBe(false);
			});
		});

		describe("delete", () => {
			test("should delete a secret from Previews settings", async ({
				expect,
			}) => {
				let patchRequestBody:
					| {
							preview_defaults?: {
								env?: Record<string, { type: string; text?: string } | null>;
							};
					  }
					| undefined;
				msw.use(
					http.patch(
						`*/accounts/:accountId/workers/workers/:workerId`,
						async ({ request }) => {
							patchRequestBody =
								(await request.json()) as typeof patchRequestBody;
							return HttpResponse.json({
								success: true,
								result: {
									preview_defaults: {
										env: patchRequestBody?.preview_defaults?.env ?? {},
									},
								},
							});
						}
					)
				);
				await runWrangler(
					"preview secret delete REMOVE_ME --skip-confirmation --worker-name test-worker"
				);
				expect(patchRequestBody?.preview_defaults?.env).toEqual({
					REMOVE_ME: null,
				});
				expect(std.out).toContain(
					'Secret "REMOVE_ME" deleted from Previews settings for Worker test-worker.'
				);
				expect(std.out).toContain("Worker: test-worker");
				expect(std.out).toContain("Previews settings");
				expect(std.out).toContain("Secrets");
				expect(std.out).toContain("(none)");
			});

			test("should respect env-specific worker name when deleting a secret", async ({
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
				let patchUrl: string | undefined;
				msw.use(
					http.patch(
						`*/accounts/:accountId/workers/workers/:workerId`,
						({ request }) => {
							patchUrl = request.url;
							return HttpResponse.json({ success: true, result: {} });
						}
					)
				);
				await runWrangler(
					"preview secret delete REMOVE_ME --env staging --skip-confirmation"
				);
				expect(patchUrl).toContain("/workers/workers/staging-worker");
			});
		});

		describe("list", () => {
			test("should list secrets as JSON", async ({ expect }) => {
				msw.use(
					http.get(`*/accounts/:accountId/workers/workers/:workerId`, () =>
						HttpResponse.json({
							success: true,
							result: {
								preview_defaults: {
									env: {
										DB_PASSWORD: { type: "secret_text" },
										API_KEY: { type: "secret_text" },
										PUBLIC_VAR: { type: "plain_text", text: "visible" },
									},
								},
							},
						})
					)
				);
				await runWrangler(
					"preview secret list --json --worker-name test-worker"
				);
				expect(std.out).toContain('"name": "DB_PASSWORD"');
				expect(std.out).toContain('"name": "API_KEY"');
				expect(std.out).not.toContain("PUBLIC_VAR");
			});

			test("should list secrets in pretty format", async ({ expect }) => {
				msw.use(
					http.get(`*/accounts/:accountId/workers/workers/:workerId`, () =>
						HttpResponse.json({
							success: true,
							result: {
								preview_defaults: {
									env: {
										MY_SECRET: { type: "secret_text" },
										PLAIN: { type: "plain_text", text: "not-a-secret" },
									},
								},
							},
						})
					)
				);
				await runWrangler("preview secret list --worker-name test-worker");
				expect(std.out).toContain("Worker: test-worker");
				expect(std.out).toContain("Previews settings");
				expect(std.out).toContain("Secrets");
				expect(std.out).toContain("MY_SECRET");
				expect(std.out).not.toContain("PLAIN");
				expect(std.out).toContain("********");
			});

			test("should respect env-specific worker name when listing secrets", async ({
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
				let getUrl: string | undefined;
				msw.use(
					http.get(
						`*/accounts/:accountId/workers/workers/:workerId`,
						({ request }) => {
							getUrl = request.url;
							return HttpResponse.json({
								success: true,
								result: { preview_defaults: { env: {} } },
							});
						}
					)
				);
				await runWrangler("preview secret list --env staging");
				expect(getUrl).toContain("/workers/workers/staging-worker");
			});
		});

		describe("bulk", () => {
			test("should bulk upload secrets to Previews settings", async ({
				expect,
			}) => {
				writeFileSync("secrets.env", "FIRST_KEY=one\nSECOND_KEY=two\n");
				let patchRequestBody:
					| {
							preview_defaults?: {
								env?: Record<string, { type: string; text?: string }>;
							};
					  }
					| undefined;
				msw.use(
					http.patch(
						`*/accounts/:accountId/workers/workers/:workerId`,
						async ({ request }) => {
							patchRequestBody =
								(await request.json()) as typeof patchRequestBody;
							return HttpResponse.json({
								success: true,
								result: {
									preview_defaults: {
										env: patchRequestBody?.preview_defaults?.env ?? {},
									},
								},
							});
						}
					)
				);
				await runWrangler("preview secret bulk secrets.env");
				const env = patchRequestBody?.preview_defaults?.env ?? {};
				expect(env).toEqual({
					FIRST_KEY: { type: "secret_text", text: "one" },
					SECOND_KEY: { type: "secret_text", text: "two" },
				});
				expect(std.out).toContain("Worker: test-worker");
				expect(std.out).toContain("Secrets");
				expect(std.out).toContain("FIRST_KEY");
				expect(std.out).toContain("SECOND_KEY");
				expect(std.out).toContain("********");
			});

			test("should respect env-specific worker name when bulk uploading secrets", async ({
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
				let patchUrl: string | undefined;
				msw.use(
					http.patch(
						`*/accounts/:accountId/workers/workers/:workerId`,
						({ request }) => {
							patchUrl = request.url;
							return HttpResponse.json({ success: true, result: {} });
						}
					)
				);
				await runWrangler("preview secret bulk secrets.env --env staging");
				expect(patchUrl).toContain("/workers/workers/staging-worker");
			});
		});
	});
});
