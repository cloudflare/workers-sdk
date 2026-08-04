import { mkdirSync, writeFileSync } from "node:fs";
import { runInTempDir } from "@cloudflare/workers-utils/test-helpers";
import { http, HttpResponse } from "msw";
import { afterEach, beforeEach, describe, test, vi } from "vitest";
import { mockAccountId, mockApiToken } from "./helpers/mock-account-id";
import { mockConsoleMethods } from "./helpers/mock-console";
import { useMockStdin } from "./helpers/mock-stdin";
import { msw } from "./helpers/msw";
import { runWrangler } from "./helpers/run-wrangler";

type PreviewDeploymentPatchBody = {
	env?: Record<string, { type: string; text?: string } | null>;
	annotations?: Record<string, string | undefined>;
};

function mockPatchLatestPreviewDeployment(
	onRequest?: (info: { url: string; body: PreviewDeploymentPatchBody }) => void
) {
	msw.use(
		http.patch(
			`*/accounts/:accountId/workers/workers/:workerId/previews/:previewId/deployments/latest`,
			async ({ request, params }) => {
				onRequest?.({
					url: request.url,
					body: (await request.json()) as PreviewDeploymentPatchBody,
				});
				return HttpResponse.json({
					success: true,
					result: {
						id: "deployment-1",
						preview_id: "preview-1",
						preview_name: String(params.previewId),
						urls: ["https://test-preview.example.workers.dev"],
						created_on: "2025-01-01T00:00:00Z",
					},
				});
			}
		)
	);
}

function mockPreviewDeploymentNotFound(code: number) {
	msw.use(
		http.patch(
			`*/accounts/:accountId/workers/workers/:workerId/previews/:previewId/deployments/latest`,
			() =>
				HttpResponse.json(
					{
						success: false,
						errors: [{ code, message: "no preview deployment" }],
						messages: [],
						result: null,
					},
					{ status: 404 }
				)
		)
	);
}

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

		afterEach(() => {
			vi.unstubAllEnvs();
		});

		describe("put", () => {
			const mockStdIn = useMockStdin({ isTTY: false });

			test("creates a new Preview deployment with the secret", async ({
				expect,
			}) => {
				mockStdIn.send("preview-secret");
				let patchedPreviewDefaults = false;
				msw.use(
					http.patch(`*/accounts/:accountId/workers/workers/:workerId`, () => {
						patchedPreviewDefaults = true;
						return HttpResponse.json({ success: true, result: {} });
					})
				);
				let requestUrl: string | undefined;
				let requestBody: PreviewDeploymentPatchBody | undefined;
				mockPatchLatestPreviewDeployment(({ url, body }) => {
					requestUrl = url;
					requestBody = body;
				});

				await runWrangler(
					"preview secret put API_KEY --name test-preview --worker-name test-worker"
				);

				expect(requestUrl).toContain(
					"/workers/workers/test-worker/previews/test-preview/deployments/latest"
				);
				expect(requestBody?.env).toEqual({
					API_KEY: { type: "secret_text", text: "preview-secret" },
				});
				expect(patchedPreviewDefaults).toBe(false);
				expect(std.out).toContain('Preview "test-preview"');
				expect(std.out).toContain("test-worker");
				expect(std.out).toContain("Preview deployment");
				expect(std.out).toContain(
					'is now live at https://test-preview.example.workers.dev'
				);
				expect(std.out).not.toContain("preview-secret");
			});

			test("defaults the Preview name to the current git branch", async ({
				expect,
			}) => {
				vi.stubEnv("WORKERS_CI_BRANCH", "branch-preview");
				mockStdIn.send("preview-secret");
				let requestUrl: string | undefined;
				mockPatchLatestPreviewDeployment(({ url }) => {
					requestUrl = url;
				});

				await runWrangler(
					"preview secret put API_KEY --worker-name test-worker"
				);

				expect(requestUrl).toContain(
					"/previews/branch-preview/deployments/latest"
				);
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
				mockPatchLatestPreviewDeployment(({ url }) => {
					requestUrl = url;
				});

				await runWrangler(
					"preview secret put API_KEY --name test-preview --env staging"
				);

				expect(requestUrl).toContain(
					"/workers/workers/staging-worker/previews/test-preview/deployments/latest"
				);
			});

			test("sends --message and --tag as deployment annotations", async ({
				expect,
			}) => {
				mockStdIn.send("preview-secret");
				let requestBody: PreviewDeploymentPatchBody | undefined;
				mockPatchLatestPreviewDeployment(({ body }) => {
					requestBody = body;
				});

				await runWrangler(
					'preview secret put API_KEY --name test-preview --worker-name test-worker --message "add a secret" --tag v1'
				);

				expect(requestBody?.annotations).toMatchObject({
					"workers/message": "add a secret",
					"workers/tag": "v1",
				});
			});

			test("uses the default annotation message when none is provided", async ({
				expect,
			}) => {
				mockStdIn.send("preview-secret");
				let requestBody: PreviewDeploymentPatchBody | undefined;
				mockPatchLatestPreviewDeployment(({ body }) => {
					requestBody = body;
				});

				await runWrangler(
					"preview secret put API_KEY --name test-preview --worker-name test-worker"
				);

				expect(requestBody?.annotations?.["workers/message"]).toBe(
					'Updated secret "API_KEY"'
				);
			});

			test("fails clearly when the Preview has no deployments", async ({
				expect,
			}) => {
				mockStdIn.send("preview-secret");
				mockPreviewDeploymentNotFound(10032);

				await expect(
					runWrangler(
						"preview secret put API_KEY --name test-preview --worker-name test-worker"
					)
				).rejects.toThrow(/no deployments for the Preview/);
			});

			test("fails clearly when the Preview is not found", async ({
				expect,
			}) => {
				mockStdIn.send("preview-secret");
				mockPreviewDeploymentNotFound(10025);

				await expect(
					runWrangler(
						"preview secret put API_KEY --name test-preview --worker-name test-worker"
					)
				).rejects.toThrow(/Preview "test-preview" was not found/);
			});

			test("fails before making API calls when env-specific previews config is invalid", async ({
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
				mockPatchLatestPreviewDeployment(() => {
					requested = true;
				});

				await expect(
					runWrangler(
						"preview secret put API_KEY --name test-preview --env staging"
					)
				).rejects.toThrow(/previews\.browser/);
				expect(requested).toBe(false);
			});
		});

		describe("delete", () => {
			test("creates a new Preview deployment removing the secret", async ({
				expect,
			}) => {
				let patchedPreviewDefaults = false;
				msw.use(
					http.patch(`*/accounts/:accountId/workers/workers/:workerId`, () => {
						patchedPreviewDefaults = true;
						return HttpResponse.json({ success: true, result: {} });
					})
				);
				let requestUrl: string | undefined;
				let requestBody: PreviewDeploymentPatchBody | undefined;
				mockPatchLatestPreviewDeployment(({ url, body }) => {
					requestUrl = url;
					requestBody = body;
				});

				await runWrangler(
					"preview secret delete REMOVE_ME --name test-preview --skip-confirmation --worker-name test-worker"
				);

				expect(requestUrl).toContain(
					"/workers/workers/test-worker/previews/test-preview/deployments/latest"
				);
				expect(requestBody?.env).toEqual({ REMOVE_ME: null });
				expect(patchedPreviewDefaults).toBe(false);
				expect(std.out).toContain('Preview "test-preview"');
				expect(std.out).toContain("test-worker");
				expect(std.out).toContain("Preview deployment");
				expect(std.out).toContain(
					'is now live at https://test-preview.example.workers.dev'
				);
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
				mockPatchLatestPreviewDeployment(({ url }) => {
					requestUrl = url;
				});

				await runWrangler(
					"preview secret delete REMOVE_ME --name test-preview --env staging --skip-confirmation"
				);

				expect(requestUrl).toContain(
					"/workers/workers/staging-worker/previews/test-preview/deployments/latest"
				);
			});

			test("uses the default annotation message when none is provided", async ({
				expect,
			}) => {
				let requestBody: PreviewDeploymentPatchBody | undefined;
				mockPatchLatestPreviewDeployment(({ body }) => {
					requestBody = body;
				});

				await runWrangler(
					"preview secret delete REMOVE_ME --name test-preview --skip-confirmation --worker-name test-worker"
				);

				expect(requestBody?.annotations?.["workers/message"]).toBe(
					'Deleted secret "REMOVE_ME"'
				);
			});

			test("fails clearly when the Preview has no deployments", async ({
				expect,
			}) => {
				mockPreviewDeploymentNotFound(10032);

				await expect(
					runWrangler(
						"preview secret delete REMOVE_ME --name test-preview --skip-confirmation --worker-name test-worker"
					)
				).rejects.toThrow(/no deployments for the Preview/);
			});

			test("fails clearly when the Preview is not found", async ({
				expect,
			}) => {
				mockPreviewDeploymentNotFound(10025);

				await expect(
					runWrangler(
						"preview secret delete REMOVE_ME --name test-preview --skip-confirmation --worker-name test-worker"
					)
				).rejects.toThrow(/Preview "test-preview" was not found/);
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
