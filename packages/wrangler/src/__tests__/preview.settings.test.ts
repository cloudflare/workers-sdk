import { mkdirSync, writeFileSync } from "node:fs";
import { http, HttpResponse } from "msw";
import { beforeEach, describe, test } from "vitest";
import { mockAccountId, mockApiToken } from "./helpers/mock-account-id";
import { mockConsoleMethods } from "./helpers/mock-console";
import { msw } from "./helpers/msw";
import { runInTempDir } from "./helpers/run-in-tmp";
import { runWrangler } from "./helpers/run-wrangler";

describe("wrangler preview", () => {
	const std = mockConsoleMethods();
	runInTempDir();
	mockApiToken();
	mockAccountId();
	describe("preview settings", () => {
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
					previews: {
						vars: { ENVIRONMENT: "preview" },
						kv_namespaces: [{ binding: "MY_KV", id: "preview-kv-id" }],
					},
				})
			);
			msw.resetHandlers();
		});

		test("should list current preview settings as JSON", async ({ expect }) => {
			msw.use(
				http.get(`*/accounts/:accountId/workers/workers/:workerId`, () =>
					HttpResponse.json({
						success: true,
						result: {
							preview_defaults: {
								logpush: false,
								env: {
									ENVIRONMENT: { type: "plain_text", text: "preview" },
								},
							},
						},
					})
				)
			);
			await runWrangler(
				"preview settings --worker-name override-worker --json"
			);
			expect(std.out).toContain('"logpush": false');
			expect(std.out).toContain('"ENVIRONMENT"');
		});

		test("should list current Previews settings in pretty format", async ({
			expect,
		}) => {
			msw.use(
				http.get(`*/accounts/:accountId/workers/workers/:workerId`, () =>
					HttpResponse.json({
						success: true,
						result: {
							preview_defaults: {
								observability: { enabled: true, head_sampling_rate: 0.5 },
								logpush: false,
								limits: { cpu_ms: 50, subrequests: 123 },
								placement: { mode: "smart" },
								env: {
									ENVIRONMENT: { type: "plain_text", text: "preview" },
									API_KEY: { type: "secret_text" },
								},
							},
						},
					})
				)
			);
			await runWrangler("preview settings --worker-name override-worker");
			expect(std.out).toContain("Worker: override-worker");
			expect(std.out).toContain("Previews settings");
			expect(std.out).toContain("enabled, 0.5 sampling");
			expect(std.out).toContain("disabled");
			expect(std.out).toContain("cpu_ms: 50");
			expect(std.out).toContain("subrequests: 123");
			expect(std.out).toContain("smart");
			expect(std.out).toContain("********");
			expect(std.out).toContain("╭");
		});

		test("should show empty bindings in pretty format", async ({ expect }) => {
			msw.use(
				http.get(`*/accounts/:accountId/workers/workers/:workerId`, () =>
					HttpResponse.json({
						success: true,
						result: {
							preview_defaults: {
								env: {},
							},
						},
					})
				)
			);
			await runWrangler("preview settings --worker-name override-worker");
			expect(std.out).toContain("Bindings");
			expect(std.out).toContain("(none)");
		});

		test("should respect env-specific worker name when listing settings", async ({
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
							result: { preview_defaults: {} },
						});
					}
				)
			);
			await runWrangler("preview settings --env staging");
			expect(getUrl).toContain("/workers/workers/staging-worker");
			expect(std.out).toContain("Worker: staging-worker");
		});
	});

	describe("preview settings update", () => {
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
					previews: {
						vars: { ENVIRONMENT: "preview" },
						kv_namespaces: [{ binding: "MY_KV", id: "preview-kv-id" }],
					},
				})
			);
			msw.resetHandlers();
		});

		test("should update preview settings from wrangler config", async ({
			expect,
		}) => {
			let patchCalled = false;
			let patchRequestBody:
				| {
						preview_defaults?: {
							env?: Record<
								string,
								{ type: string; text?: string; namespace_id?: string }
							>;
							logpush?: boolean;
							observability?: {
								enabled?: boolean;
								head_sampling_rate?: number;
							};
						};
				  }
				| undefined;
			msw.use(
				http.get(`*/accounts/:accountId/workers/workers/:workerId`, () =>
					HttpResponse.json({
						success: true,
						result: {
							preview_defaults: {
								observability: { enabled: true, head_sampling_rate: 1 },
								logpush: false,
								env: { OLD: { type: "plain_text", text: "value" } },
							},
						},
					})
				),
				http.patch(
					`*/accounts/:accountId/workers/workers/:workerId`,
					async ({ request }) => {
						patchCalled = true;
						patchRequestBody =
							(await request.json()) as typeof patchRequestBody;
						return HttpResponse.json({ success: true, result: {} });
					}
				)
			);
			await runWrangler(
				"preview settings update --worker-name override-worker --skip-confirmation"
			);
			expect(patchCalled).toBe(true);
			expect(std.out).toContain(
				"✨ Updated Previews settings for Worker override-worker."
			);
			expect(std.out).toContain("Worker: override-worker");
			expect(patchRequestBody?.preview_defaults?.env).toMatchObject({
				OLD: { type: "plain_text", text: "value" },
				ENVIRONMENT: { type: "plain_text", text: "preview" },
				MY_KV: { type: "kv_namespace", namespace_id: "preview-kv-id" },
			});
		});

		test("should render a useful diff before updating preview settings", async ({
			expect,
		}) => {
			writeFileSync(
				"wrangler.json",
				JSON.stringify({
					name: "test-worker",
					main: "src/index.ts",
					previews: {
						logpush: false,
						vars: { ENVIRONMENT: "preview" },
					},
				})
			);

			msw.use(
				http.get(`*/accounts/:accountId/workers/workers/:workerId`, () =>
					HttpResponse.json({
						success: true,
						result: {
							preview_defaults: {
								logpush: true,
							},
						},
					})
				),
				http.patch(`*/accounts/:accountId/workers/workers/:workerId`, () =>
					HttpResponse.json({
						success: true,
						result: {
							preview_defaults: {
								logpush: false,
								env: {
									ENVIRONMENT: { type: "plain_text", text: "preview" },
								},
							},
						},
					})
				)
			);

			await runWrangler(
				"preview settings update --worker-name override-worker --skip-confirmation"
			);

			expect(std.out).toContain("+  env: {");
			expect(std.out).toContain("+    ENVIRONMENT: {");
			expect(std.out).toContain('+      type: "plain_text"');
			expect(std.out).toContain('+      text: "preview"');
			expect(std.out).toContain("-  logpush: true");
			expect(std.out).toContain("+  logpush: false");
		});

		test("should preserve nested observability fields when only partially overridden", async ({
			expect,
		}) => {
			writeFileSync(
				"wrangler.json",
				JSON.stringify({
					name: "test-worker",
					main: "src/index.ts",
					compatibility_date: "2025-01-01",
					previews: { observability: { enabled: true } },
				})
			);
			let patchRequestBody:
				| {
						preview_defaults?: {
							observability?: {
								enabled?: boolean;
								head_sampling_rate?: number;
							};
						};
				  }
				| undefined;
			msw.use(
				http.get(`*/accounts/:accountId/workers/workers/:workerId`, () =>
					HttpResponse.json({
						success: true,
						result: {
							preview_defaults: {
								observability: { enabled: false, head_sampling_rate: 0.25 },
							},
						},
					})
				),
				http.patch(
					`*/accounts/:accountId/workers/workers/:workerId`,
					async ({ request }) => {
						patchRequestBody =
							(await request.json()) as typeof patchRequestBody;
						return HttpResponse.json({ success: true, result: {} });
					}
				)
			);
			await runWrangler(
				"preview settings update --worker-name override-worker --skip-confirmation"
			);
			expect(patchRequestBody?.preview_defaults?.observability).toEqual({
				enabled: true,
				head_sampling_rate: 0.25,
			});
		});

		test("should render canonical Previews settings returned by the update response", async ({
			expect,
		}) => {
			msw.use(
				http.get(`*/accounts/:accountId/workers/workers/:workerId`, () =>
					HttpResponse.json({
						success: true,
						result: {
							preview_defaults: { logpush: true },
						},
					})
				),
				http.patch(
					`*/accounts/:accountId/workers/workers/:workerId`,
					async () =>
						HttpResponse.json({
							success: true,
							result: {
								preview_defaults: { logpush: false },
							},
						})
				)
			);
			await runWrangler(
				"preview settings update --worker-name override-worker --skip-confirmation"
			);
			expect(std.out).toContain("disabled");
		});

		test("should prefer previews limits over top-level limits", async ({
			expect,
		}) => {
			writeFileSync(
				"wrangler.json",
				JSON.stringify({
					name: "test-worker",
					main: "src/index.ts",
					compatibility_date: "2025-01-01",
					limits: { cpu_ms: 100, subrequests: 200 },
					previews: { limits: { subrequests: 50 } },
				})
			);
			let patchRequestBody:
				| {
						preview_defaults?: {
							limits?: { cpu_ms?: number; subrequests?: number };
						};
				  }
				| undefined;
			msw.use(
				http.get(`*/accounts/:accountId/workers/workers/:workerId`, () =>
					HttpResponse.json({
						success: true,
						result: { preview_defaults: {} },
					})
				),
				http.patch(
					`*/accounts/:accountId/workers/workers/:workerId`,
					async ({ request }) => {
						patchRequestBody =
							(await request.json()) as typeof patchRequestBody;
						return HttpResponse.json({ success: true, result: {} });
					}
				)
			);
			await runWrangler(
				"preview settings update --worker-name override-worker --skip-confirmation"
			);
			expect(patchRequestBody?.preview_defaults?.limits).toEqual({
				subrequests: 50,
			});
		});

		test("should skip updating when Previews settings are already up to date", async ({
			expect,
		}) => {
			let patchCalled = false;
			msw.use(
				http.get(`*/accounts/:accountId/workers/workers/:workerId`, () =>
					HttpResponse.json({
						success: true,
						result: {
							preview_defaults: {
								env: {
									ENVIRONMENT: { type: "plain_text", text: "preview" },
									MY_KV: {
										type: "kv_namespace",
										namespace_id: "preview-kv-id",
									},
								},
							},
						},
					})
				),
				http.patch(`*/accounts/:accountId/workers/workers/:workerId`, () => {
					patchCalled = true;
					return HttpResponse.json({ success: true, result: {} });
				})
			);
			await runWrangler(
				"preview settings update --worker-name override-worker"
			);
			expect(patchCalled).toBe(false);
			expect(std.out).toContain(
				"✨ Previews settings for Worker override-worker are already up to date."
			);
		});

		test("should skip updating when neither remote nor local settings define env", async ({
			expect,
		}) => {
			writeFileSync(
				"wrangler.json",
				JSON.stringify({
					name: "test-worker",
					main: "src/index.ts",
				})
			);

			let patchCalled = false;
			msw.use(
				http.get(`*/accounts/:accountId/workers/workers/:workerId`, () =>
					HttpResponse.json({
						success: true,
						result: {
							preview_defaults: {},
						},
					})
				),
				http.patch(`*/accounts/:accountId/workers/workers/:workerId`, () => {
					patchCalled = true;
					return HttpResponse.json({ success: true, result: {} });
				})
			);

			await runWrangler(
				"preview settings update --worker-name override-worker"
			);

			expect(patchCalled).toBe(false);
			expect(std.out).toContain(
				"✨ Previews settings for Worker override-worker are already up to date."
			);
		});

		test("should not clear existing bindings when previews has only non-binding settings", async ({
			expect,
		}) => {
			writeFileSync(
				"wrangler.json",
				JSON.stringify({
					name: "test-worker",
					main: "src/index.ts",
					previews: { logpush: false },
				})
			);
			let patchRequestBody:
				| {
						preview_defaults?: {
							env?: Record<string, { type: string; text?: string }>;
							logpush?: boolean;
						};
				  }
				| undefined;
			msw.use(
				http.get(`*/accounts/:accountId/workers/workers/:workerId`, () =>
					HttpResponse.json({
						success: true,
						result: {
							preview_defaults: {
								logpush: true,
								env: {
									EXISTING_SECRET: { type: "plain_text", text: "value" },
								},
							},
						},
					})
				),
				http.patch(
					`*/accounts/:accountId/workers/workers/:workerId`,
					async ({ request }) => {
						patchRequestBody =
							(await request.json()) as typeof patchRequestBody;
						return HttpResponse.json({ success: true, result: {} });
					}
				)
			);
			await runWrangler(
				"preview settings update --worker-name override-worker"
			);
			expect(patchRequestBody?.preview_defaults?.logpush).toBe(false);
			expect(patchRequestBody?.preview_defaults?.env).toMatchObject({
				EXISTING_SECRET: { type: "plain_text", text: "value" },
			});
		});

		test("should replace binding entries wholesale when type changes", async ({
			expect,
		}) => {
			writeFileSync(
				"wrangler.json",
				JSON.stringify({
					name: "test-worker",
					main: "src/index.ts",
					previews: { vars: { MY_BINDING: "new-value" } },
				})
			);
			let patchRequestBody:
				| {
						preview_defaults?: {
							env?: Record<string, Record<string, unknown>>;
						};
				  }
				| undefined;
			msw.use(
				http.get(`*/accounts/:accountId/workers/workers/:workerId`, () =>
					HttpResponse.json({
						success: true,
						result: {
							preview_defaults: {
								env: {
									MY_BINDING: {
										type: "kv_namespace",
										namespace_id: "old-kv-id",
									},
								},
							},
						},
					})
				),
				http.patch(
					`*/accounts/:accountId/workers/workers/:workerId`,
					async ({ request }) => {
						patchRequestBody =
							(await request.json()) as typeof patchRequestBody;
						return HttpResponse.json({ success: true, result: {} });
					}
				)
			);
			await runWrangler(
				"preview settings update --worker-name override-worker --skip-confirmation"
			);
			const binding = patchRequestBody?.preview_defaults?.env?.MY_BINDING;
			expect(binding?.type).toBe("plain_text");
			expect(binding?.text).toBe("new-value");
			expect(binding?.namespace_id).toBeUndefined();
		});

		test("should resolve env-specific previews settings using config inheritability rules", async ({
			expect,
		}) => {
			writeFileSync(
				"wrangler.json",
				JSON.stringify({
					name: "test-worker",
					main: "src/index.ts",
					placement: { mode: "smart" },
					limits: { cpu_ms: 100 },
					previews: {
						vars: { TOP_ONLY: "top" },
						limits: { cpu_ms: 25 },
					},
					env: {
						staging: {
							previews: {
								vars: { STAGE_ONLY: "stage" },
								limits: { cpu_ms: 50 },
							},
						},
					},
				})
			);

			let patchRequestBody:
				| {
						preview_defaults?: {
							placement?: { mode?: string };
							limits?: { cpu_ms?: number };
							env?: Record<string, { type: string; text?: string }>;
						};
				  }
				| undefined;

			msw.use(
				http.get(`*/accounts/:accountId/workers/workers/:workerId`, () =>
					HttpResponse.json({
						success: true,
						result: { preview_defaults: {} },
					})
				),
				http.patch(
					`*/accounts/:accountId/workers/workers/:workerId`,
					async ({ request }) => {
						patchRequestBody =
							(await request.json()) as typeof patchRequestBody;
						return HttpResponse.json({ success: true, result: {} });
					}
				)
			);

			await runWrangler(
				"preview settings update --env staging --worker-name override-worker --skip-confirmation"
			);
			expect(patchRequestBody?.preview_defaults?.placement).toEqual({
				mode: "smart",
			});
			expect(patchRequestBody?.preview_defaults?.limits).toEqual({
				cpu_ms: 50,
			});
			expect(patchRequestBody?.preview_defaults?.env).toMatchObject({
				STAGE_ONLY: { type: "plain_text", text: "stage" },
			});
			expect(patchRequestBody?.preview_defaults?.env).not.toHaveProperty(
				"TOP_ONLY"
			);
		});

		test("should fail before making API calls when env-specific previews.queues is malformed", async ({
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
								queues: [{ binding: "MY_QUEUE", queue: "jobs" }],
							},
						},
					},
				})
			);

			let requested = false;
			msw.use(
				http.get(`*/accounts/:accountId/workers/workers/:workerId`, () => {
					requested = true;
					return HttpResponse.json({
						success: true,
						result: { preview_defaults: {} },
					});
				})
			);

			await expect(
				runWrangler(
					"preview settings update --env staging --worker-name override-worker --skip-confirmation"
				)
			).rejects.toThrow(/previews\.queues/);
			expect(requested).toBe(false);
		});
	});
});
