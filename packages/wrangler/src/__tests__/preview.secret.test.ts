import { mkdirSync, writeFileSync } from "node:fs";
import readline from "node:readline";
import { runInTempDir } from "@cloudflare/workers-utils/test-helpers";
import { http, HttpResponse } from "msw";
import { afterEach, beforeEach, describe, test, vi } from "vitest";
import { mockAccountId, mockApiToken } from "./helpers/mock-account-id";
import { mockConsoleMethods } from "./helpers/mock-console";
import { useMockStdin } from "./helpers/mock-stdin";
import { msw } from "./helpers/msw";
import { runWrangler } from "./helpers/run-wrangler";

type PreviewDeploymentPatchBody = {
	env?: Record<string, { type: string; text: string } | null>;
	annotations?: Record<string, string | undefined>;
};

const BRANCH_ENV_VARS = [
	"WORKERS_CI_BRANCH",
	"GITHUB_HEAD_REF",
	"GITHUB_REF_NAME",
	"CI_COMMIT_REF_NAME",
] as const;
const NO_ACTIVE_PREVIEW_URLS_MESSAGE =
	"Note: This Preview deployment has no active URLs. To get one, enable Preview Deployments on workers.dev or a custom domain. See https://developers.cloudflare.com/workers/previews/custom-domains/ for more information";

async function withoutBranchEnvVars<T>(callback: () => Promise<T>): Promise<T> {
	const originalBranchEnv = Object.fromEntries(
		BRANCH_ENV_VARS.map((envVar) => [envVar, process.env[envVar]])
	);
	for (const envVar of BRANCH_ENV_VARS) {
		delete process.env[envVar];
	}
	try {
		return await callback();
	} finally {
		for (const envVar of BRANCH_ENV_VARS) {
			const originalValue = originalBranchEnv[envVar];
			if (originalValue === undefined) {
				delete process.env[envVar];
			} else {
				process.env[envVar] = originalValue;
			}
		}
	}
}

function mockPatchLatestPreviewDeployment(
	onRequest?: (info: { url: string; body: PreviewDeploymentPatchBody }) => void,
	urls: string[] | undefined = ["https://test-preview.example.workers.dev"]
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
						urls,
						created_on: "2025-01-01T00:00:00Z",
					},
				});
			}
		)
	);
}

function mockPatchPreviewDeploymentError(code: number) {
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

function mockGetLatestPreviewDeployment(
	env: Record<string, { type: string; text: string }>,
	onRequest?: (info: { url: string }) => void
) {
	msw.use(
		http.get(
			`*/accounts/:accountId/workers/workers/:workerId/previews/:previewId/deployments/latest`,
			({ request, params }) => {
				onRequest?.({ url: request.url });
				return HttpResponse.json({
					success: true,
					result: {
						id: "deployment-1",
						preview_id: "preview-1",
						preview_name: String(params.previewId),
						env,
						created_on: "2025-01-01T00:00:00Z",
					},
				});
			}
		)
	);
}

function mockGetPreviewDeploymentError(code: number) {
	msw.use(
		http.get(
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
				expect(std.out).toContain('Preview "test-preview"');
				expect(std.out).toContain("test-worker");
				expect(std.out).toContain("Preview deployment");
				expect(std.out).toContain(
					"is now live at https://test-preview.example.workers.dev"
				);
				expect(std.out).not.toContain("preview-secret");
			});

			test("notes when the new Preview deployment has no active URLs", async ({
				expect,
			}) => {
				mockStdIn.send("preview-secret");
				mockPatchLatestPreviewDeployment(undefined, []);

				await runWrangler(
					"preview secret put API_KEY --name test-preview --worker-name test-worker"
				);

				expect(std.out).toContain("Created Preview deployment deployment-1");
				expect(std.out).toContain(NO_ACTIVE_PREVIEW_URLS_MESSAGE);
				expect(std.out).not.toContain("is now live at");
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

			test("fails clearly when no name is given and there is no git branch", async ({
				expect,
			}) => {
				// `runInTempDir` puts us in an `os.tmpdir()` directory that is not a
				// git worktree, so with no CI branch env vars the Preview name
				// cannot be inferred.
				await withoutBranchEnvVars(() =>
					expect(
						runWrangler("preview secret put API_KEY --worker-name test-worker")
					).rejects.toThrow(/Could not determine Preview name/)
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
				mockPatchPreviewDeploymentError(10032);

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
				mockPatchPreviewDeploymentError(10025);

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
					"is now live at https://test-preview.example.workers.dev"
				);
			});

			test("notes when the new Preview deployment has no active URLs", async ({
				expect,
			}) => {
				mockPatchLatestPreviewDeployment(undefined, []);

				await runWrangler(
					"preview secret delete REMOVE_ME --name test-preview --skip-confirmation --worker-name test-worker"
				);

				expect(std.out).toContain("Created Preview deployment deployment-1");
				expect(std.out).toContain(NO_ACTIVE_PREVIEW_URLS_MESSAGE);
				expect(std.out).not.toContain("is now live at");
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
				mockPatchPreviewDeploymentError(10032);

				await expect(
					runWrangler(
						"preview secret delete REMOVE_ME --name test-preview --skip-confirmation --worker-name test-worker"
					)
				).rejects.toThrow(/no deployments for the Preview/);
			});

			test("fails clearly when the Preview is not found", async ({
				expect,
			}) => {
				mockPatchPreviewDeploymentError(10025);

				await expect(
					runWrangler(
						"preview secret delete REMOVE_ME --name test-preview --skip-confirmation --worker-name test-worker"
					)
				).rejects.toThrow(/Preview "test-preview" was not found/);
			});
		});

		describe("list", () => {
			test("reads the latest Preview deployment", async ({ expect }) => {
				let requestUrl: string | undefined;
				mockGetLatestPreviewDeployment(
					{ API_KEY: { type: "secret_text", text: "preview-secret" } },
					({ url }) => {
						requestUrl = url;
					}
				);
				await runWrangler(
					"preview secret list --json --name test-preview --worker-name test-worker"
				);
				expect(requestUrl).toContain(
					"/workers/workers/test-worker/previews/test-preview/deployments/latest"
				);
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
					mockGetLatestPreviewDeployment({
						MY_SECRET: { type: "secret_text", text },
						PLAIN: { type: "plain_text", text: "not-a-secret" },
					});
					await runWrangler(
						`preview secret list ${json ? "--json " : ""}--name test-preview --worker-name test-worker`
					);
					// The secret name is always listed
					expect(std.out).toContain("MY_SECRET");
					// Non-secret bindings are never listed
					expect(std.out).not.toContain("PLAIN");
					// The secret value is never printed, even when the API returns it
					expect(std.out).not.toContain("super-secret-value");
					if (json) {
						expect(std.out).toContain('"name": "MY_SECRET"');
						expect(std.out).toContain('"type": "secret_text"');
					} else {
						expect(std.out).toContain("Worker: test-worker");
						expect(std.out).toContain("Preview: test-preview");
						expect(std.out).toContain("Latest Preview deployment");
						expect(std.out).not.toContain("Previews settings");
						expect(std.out).toContain("Secrets");
						expect(std.out).toContain("********");
					}
				}
			);

			test("defaults the Preview name to the current git branch", async ({
				expect,
			}) => {
				vi.stubEnv("WORKERS_CI_BRANCH", "branch-preview");
				let requestUrl: string | undefined;
				mockGetLatestPreviewDeployment({}, ({ url }) => {
					requestUrl = url;
				});
				await runWrangler("preview secret list --worker-name test-worker");
				expect(requestUrl).toContain(
					"/previews/branch-preview/deployments/latest"
				);
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
				let requestUrl: string | undefined;
				mockGetLatestPreviewDeployment({}, ({ url }) => {
					requestUrl = url;
				});
				await runWrangler(
					"preview secret list --name test-preview --env staging"
				);
				expect(requestUrl).toContain(
					"/workers/workers/staging-worker/previews/test-preview/deployments/latest"
				);
			});

			test("fails clearly when the Preview has no deployments", async ({
				expect,
			}) => {
				mockGetPreviewDeploymentError(10222);
				await expect(
					runWrangler(
						"preview secret list --name test-preview --worker-name test-worker"
					)
				).rejects.toThrow(/no deployments for the Preview/);
			});

			test("fails clearly when the Preview is not found", async ({
				expect,
			}) => {
				mockGetPreviewDeploymentError(10025);
				await expect(
					runWrangler(
						"preview secret list --name test-preview --worker-name test-worker"
					)
				).rejects.toThrow(/Preview "test-preview" was not found/);
			});
		});

		describe("bulk", () => {
			test("creates a new Preview deployment with all secrets", async ({
				expect,
			}) => {
				writeFileSync("secrets.env", "FIRST_KEY=one\nSECOND_KEY=two\n");
				let requestUrl: string | undefined;
				let requestBody: PreviewDeploymentPatchBody | undefined;
				mockPatchLatestPreviewDeployment(({ url, body }) => {
					requestUrl = url;
					requestBody = body;
				});
				await runWrangler(
					"preview secret bulk secrets.env --name test-preview --worker-name test-worker"
				);
				expect(requestUrl).toContain(
					"/workers/workers/test-worker/previews/test-preview/deployments/latest"
				);
				expect(requestBody?.env).toEqual({
					FIRST_KEY: { type: "secret_text", text: "one" },
					SECOND_KEY: { type: "secret_text", text: "two" },
				});
				expect(std.out).toContain(
					"Successfully created secret for key: FIRST_KEY"
				);
				expect(std.out).toContain(
					"Successfully created secret for key: SECOND_KEY"
				);
				expect(std.out).toContain("Created Preview deployment deployment-1");
				expect(std.out).toContain("with 2 created and 0 deleted secrets");
				expect(std.out).toContain(
					"is now live at https://test-preview.example.workers.dev"
				);
				expect(std.out).not.toContain("one");
				expect(std.out).not.toContain("two");
			});

			test("notes when the new Preview deployment has no active URLs", async ({
				expect,
			}) => {
				writeFileSync("secrets.env", "FIRST_KEY=one\nSECOND_KEY=two\n");
				mockPatchLatestPreviewDeployment(undefined, []);

				await runWrangler(
					"preview secret bulk secrets.env --name test-preview --worker-name test-worker"
				);

				expect(std.out).toContain("Created Preview deployment deployment-1");
				expect(std.out).toContain(NO_ACTIVE_PREVIEW_URLS_MESSAGE);
				expect(std.out).not.toContain("is now live at");
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
				let requestUrl: string | undefined;
				mockPatchLatestPreviewDeployment(({ url }) => {
					requestUrl = url;
				});
				await runWrangler(
					"preview secret bulk secrets.env --name test-preview --env staging"
				);
				expect(requestUrl).toContain(
					"/workers/workers/staging-worker/previews/test-preview/deployments/latest"
				);
			});

			test("sends --message and --tag as deployment annotations", async ({
				expect,
			}) => {
				writeFileSync("secrets.env", "API_KEY=one\n");
				let requestBody: PreviewDeploymentPatchBody | undefined;
				mockPatchLatestPreviewDeployment(({ body }) => {
					requestBody = body;
				});
				await runWrangler(
					'preview secret bulk secrets.env --name test-preview --worker-name test-worker --message "add secrets" --tag v1'
				);
				expect(requestBody?.annotations).toMatchObject({
					"workers/message": "add secrets",
					"workers/tag": "v1",
				});
			});

			test("uses the default annotation message when none is provided", async ({
				expect,
			}) => {
				writeFileSync("secrets.env", "FIRST_KEY=one\nSECOND_KEY=two\n");
				let requestBody: PreviewDeploymentPatchBody | undefined;
				mockPatchLatestPreviewDeployment(({ body }) => {
					requestBody = body;
				});
				await runWrangler(
					"preview secret bulk secrets.env --name test-preview --worker-name test-worker"
				);
				expect(requestBody?.annotations?.["workers/message"]).toBe(
					"Created 2 and deleted 0 secrets"
				);
			});

			test("deletes secrets for null values, like `wrangler secret bulk`", async ({
				expect,
			}) => {
				writeFileSync(
					"secrets.json",
					JSON.stringify({ KEEP_ME: "value", REMOVE_ME: null, ALSO_GONE: null })
				);
				let requestBody: PreviewDeploymentPatchBody | undefined;
				mockPatchLatestPreviewDeployment(({ body }) => {
					requestBody = body;
				});
				await runWrangler(
					"preview secret bulk secrets.json --name test-preview --worker-name test-worker"
				);
				// `null` maps to `null` in the merge-patch body, which deletes the secret
				expect(requestBody?.env).toEqual({
					KEEP_ME: { type: "secret_text", text: "value" },
					REMOVE_ME: null,
					ALSO_GONE: null,
				});
				expect(requestBody?.annotations?.["workers/message"]).toBe(
					"Created 1 and deleted 2 secrets"
				);
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

			test("makes no API call when there is no input", async ({ expect }) => {
				let requested = false;
				mockPatchLatestPreviewDeployment(() => {
					requested = true;
				});
				vi.spyOn(readline, "createInterface").mockImplementation(
					() => null as unknown as readline.Interface
				);
				await runWrangler(
					"preview secret bulk --name test-preview --worker-name test-worker"
				);
				expect(requested).toBe(false);
				expect(std.err).toContain(
					"🚨 No content found in file, or piped input."
				);
			});

			test("fails clearly when the Preview has no deployments", async ({
				expect,
			}) => {
				writeFileSync("secrets.env", "API_KEY=one\n");
				mockPatchPreviewDeploymentError(10032);
				await expect(
					runWrangler(
						"preview secret bulk secrets.env --name test-preview --worker-name test-worker"
					)
				).rejects.toThrow(/no deployments for the Preview/);
			});

			test("fails clearly when the Preview is not found", async ({
				expect,
			}) => {
				writeFileSync("secrets.env", "API_KEY=one\n");
				mockPatchPreviewDeploymentError(10025);
				await expect(
					runWrangler(
						"preview secret bulk secrets.env --name test-preview --worker-name test-worker"
					)
				).rejects.toThrow(/Preview "test-preview" was not found/);
			});
		});
	});
});
