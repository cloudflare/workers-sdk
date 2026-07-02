import {
	readWranglerConfig,
	runInTempDir,
	writeWranglerConfig,
} from "@cloudflare/workers-utils/test-helpers";
import { http, HttpResponse } from "msw";
import { afterEach, beforeEach, describe, it } from "vitest";
import { mockAccountId, mockApiToken } from "./helpers/mock-account-id";
import { mockConsoleMethods } from "./helpers/mock-console";
import { clearDialogs, mockConfirm } from "./helpers/mock-dialogs";
import { useMockIsTTY } from "./helpers/mock-istty";
import { createFetchResult, msw } from "./helpers/msw";
import { runWrangler } from "./helpers/run-wrangler";

type JsonResponseBody = Parameters<typeof HttpResponse.json>[0];

function mockGet(
	path: string,
	result: unknown,
	resultInfo?: Record<string, unknown>
) {
	msw.use(
		http.get(
			`*/accounts/:accountId/flagship/${path}`,
			() =>
				HttpResponse.json(createFetchResult(result, true, [], [], resultInfo)),
			{ once: true }
		)
	);
}

function mockPaged(
	path: string,
	pages: Array<{ items: unknown[]; cursor: string | null }>
) {
	msw.use(
		http.get(`*/accounts/:accountId/flagship/${path}`, ({ request }) => {
			const cursor = new URL(request.url).searchParams.get("cursor");
			const index = cursor
				? pages.findIndex((page, i) => i > 0 && pages[i - 1].cursor === cursor)
				: 0;
			const page = pages[index] ?? pages[pages.length - 1];
			return HttpResponse.json(
				createFetchResult(page.items, true, [], [], {
					count: page.items.length,
					cursor: page.cursor,
				})
			);
		})
	);
}

function mockRawGet(path: string, result: JsonResponseBody) {
	msw.use(
		http.get(
			`*/accounts/:accountId/flagship/${path}`,
			() => HttpResponse.json(result),
			{ once: true }
		)
	);
}

function captureBody(
	method: "post" | "put" | "delete",
	path: string,
	result: unknown
): Promise<unknown> {
	return new Promise((resolve) => {
		msw.use(
			http[method](
				`*/accounts/:accountId/flagship/${path}`,
				async ({ request }) => {
					resolve(request.body ? await request.json().catch(() => null) : null);
					return HttpResponse.json(createFetchResult(result, true));
				},
				{ once: true }
			)
		);
	});
}

function captureContentType(
	method: "post" | "put",
	path: string,
	result: unknown
): Promise<string | null> {
	return new Promise((resolve) => {
		msw.use(
			http[method](
				`*/accounts/:accountId/flagship/${path}`,
				({ request }) => {
					resolve(request.headers.get("content-type"));
					return HttpResponse.json(createFetchResult(result, true));
				},
				{ once: true }
			)
		);
	});
}

describe("flagship", () => {
	mockAccountId();
	mockApiToken();
	runInTempDir();
	const { setIsTTY } = useMockIsTTY();
	const std = mockConsoleMethods();

	beforeEach(() => setIsTTY(true));
	afterEach(() => clearDialogs());

	describe("apps", () => {
		it("creates an app", async ({ expect }) => {
			const body = captureBody("post", "apps", {
				id: "app-1",
				name: "checkout",
			});
			await runWrangler("flagship apps create checkout");
			await expect(body).resolves.toEqual({ name: "checkout" });
			expect(std.out).toContain("Created Flagship app");
			expect(std.out).toContain("checkout");
			expect(std.out).toContain("app-1");
			expect(std.out).toContain("To access your new Flagship");
		});

		it("sends a JSON content-type so the API parses the body", async ({
			expect,
		}) => {
			const contentType = captureContentType("post", "apps", {
				id: "app-1",
				name: "checkout",
			});
			await runWrangler("flagship apps create checkout");
			await expect(contentType).resolves.toContain("application/json");
		});

		it("adds a created app to wrangler.jsonc when given a binding", async ({
			expect,
		}) => {
			writeWranglerConfig({}, "./wrangler.jsonc");
			const body = captureBody("post", "apps", {
				id: "app-1",
				name: "checkout",
				created_at: "2026-01-01",
				updated_at: "2026-01-02",
				updated_by: "dev@cloudflare.com",
			});
			await runWrangler("flagship apps create checkout --binding FLAGS");
			await expect(body).resolves.toEqual({ name: "checkout" });
			expect(readWranglerConfig("./wrangler.jsonc")).toMatchObject({
				flagship: [{ binding: "FLAGS", app_id: "app-1" }],
			});
		});

		it("does not update config when creating an app with --json", async ({
			expect,
		}) => {
			writeWranglerConfig({}, "./wrangler.jsonc");
			msw.use(
				http.post("*/accounts/:accountId/flagship/apps", () =>
					HttpResponse.json(
						createFetchResult({ id: "app-1", name: "checkout" }, true)
					)
				)
			);
			await runWrangler("flagship apps create checkout --binding FLAGS --json");
			expect(JSON.parse(std.out)).toEqual({ id: "app-1", name: "checkout" });
			expect(readWranglerConfig("./wrangler.jsonc")).not.toHaveProperty(
				"flagship"
			);
		});

		it("lists apps", async ({ expect }) => {
			mockGet("apps", [
				{
					id: "app-1",
					name: "checkout",
					created_at: "2026-01-01",
					updated_at: "2026-01-02",
					updated_by: "dev@cloudflare.com",
				},
			]);
			await runWrangler("flagship apps list");
			expect(std.out).toContain("app-1");
			expect(std.out).toContain("checkout");
		});

		it("follows app list cursors", async ({ expect }) => {
			mockPaged("apps", [
				{
					items: [
						{
							id: "app-1",
							name: "checkout",
							created_at: "2026-01-01",
							updated_at: "2026-01-02",
							updated_by: "dev@cloudflare.com",
						},
					],
					cursor: "page-2",
				},
				{
					items: [
						{
							id: "app-2",
							name: "experiments",
							created_at: "2026-01-01",
							updated_at: "2026-01-03",
							updated_by: "dev@cloudflare.com",
						},
					],
					cursor: null,
				},
			]);
			await runWrangler("flagship apps list");
			expect(std.out).toContain("app-1");
			expect(std.out).toContain("app-2");
		});

		it("updates an app", async ({ expect }) => {
			const body = captureBody("put", "apps/app-1", {
				id: "app-1",
				name: "renamed",
			});
			await runWrangler("flagship apps update app-1 --name renamed");
			await expect(body).resolves.toEqual({ name: "renamed" });
			expect(std.out).toContain("Updated Flagship app");
			expect(std.out).toContain("renamed");
		});

		it("deletes an app with confirmation", async ({ expect }) => {
			mockConfirm({
				text: "Are you sure you want to delete the Flagship app 'app-1'? This also deletes all of its flags.",
				result: true,
			});
			const body = captureBody("delete", "apps/app-1", { id: "app-1" });
			await runWrangler("flagship apps delete app-1");
			await expect(body).resolves.toBeNull();
			expect(std.out).toContain("Deleted Flagship app 'app-1'");
		});

		it("deletes an app with --json (skips prompt, outputs result)", async ({
			expect,
		}) => {
			msw.use(
				http.delete(
					"*/accounts/:accountId/flagship/apps/app-1",
					() => HttpResponse.json(createFetchResult({ id: "app-1" }, true)),
					{ once: true }
				)
			);
			await runWrangler("flagship apps delete app-1 --force --json");
			expect(JSON.parse(std.out)).toEqual({ id: "app-1" });
		});

		it("deletes multiple apps", async ({ expect }) => {
			const deleted: string[] = [];
			msw.use(
				http.delete(
					"*/accounts/:accountId/flagship/apps/:appId",
					({ params }) => {
						const appId = String(params.appId);
						deleted.push(appId);
						return HttpResponse.json(createFetchResult({ id: appId }, true));
					}
				)
			);
			await runWrangler("flagship apps delete app-1 app-2 --force --json");
			expect(deleted).toEqual(["app-1", "app-2"]);
			expect(JSON.parse(std.out)).toEqual([{ id: "app-1" }, { id: "app-2" }]);
		});
	});

	describe("flags", () => {
		it("creates a boolean flag with a targeting rule", async ({ expect }) => {
			const body = captureBody("post", "apps/app-1/flags", {
				key: "new-ui",
				type: "boolean",
				enabled: true,
				default_variation: "off",
				variations: { on: true, off: false },
				rules: [],
			});
			await runWrangler(
				`flagship flags create app-1 new-ui --variation on=true --variation off=false --default-variation off --rule "priority=1; serve=on; when=plan equals pro AND country in [US,CA]; rollout=30%@user_id"`
			);
			await expect(body).resolves.toEqual({
				key: "new-ui",
				description: undefined,
				enabled: true,
				default_variation: "off",
				variations: { on: true, off: false },
				rules: [
					{
						priority: 1,
						serve_variation: "on",
						conditions: [
							{ attribute: "plan", operator: "equals", value: "pro" },
							{ attribute: "country", operator: "in", value: ["US", "CA"] },
						],
						rollout: { percentage: 30, attribute: "user_id" },
					},
				],
			});
			expect(std.out).toContain("Created flag");
			expect(std.out).toContain("new-ui");
		});

		it("accepts a rule provided as JSON", async ({ expect }) => {
			const body = captureBody("post", "apps/app-1/flags", { key: "f" });
			await runWrangler(
				`flagship flags create app-1 f --variation on=true --variation off=false --default-variation off --rule-json '{"priority":1,"serve_variation":"on","conditions":[{"logical_operator":"OR","clauses":[{"attribute":"beta","operator":"equals","value":true}]}]}'`
			);
			await expect(body).resolves.toMatchObject({
				rules: [
					{
						priority: 1,
						serve_variation: "on",
						conditions: [
							{
								logical_operator: "OR",
								clauses: [
									{ attribute: "beta", operator: "equals", value: true },
								],
							},
						],
					},
				],
			});
		});

		it("preserves condition values that contain the operator name", async ({
			expect,
		}) => {
			const body = captureBody("post", "apps/app-1/flags", { key: "f" });
			await runWrangler(
				`flagship flags create app-1 f --variation on=true --variation off=false --default-variation off --rule "priority=1; serve=on; when=msg equals a equals b"`
			);
			await expect(body).resolves.toMatchObject({
				rules: [
					{
						conditions: [
							{ attribute: "msg", operator: "equals", value: "a equals b" },
						],
					},
				],
			});
		});

		it("parses JSON-style arrays for in operators", async ({ expect }) => {
			const body = captureBody("post", "apps/app-1/flags", { key: "f" });
			await runWrangler(
				`flagship flags create app-1 f --variation on=true --variation off=false --default-variation off --rule 'serve=on; when=country in ["US","CA"]'`
			);
			await expect(body).resolves.toMatchObject({
				rules: [
					{
						conditions: [
							{ attribute: "country", operator: "in", value: ["US", "CA"] },
						],
					},
				],
			});
		});

		it("rejects empty and malformed condition expressions", async ({
			expect,
		}) => {
			await expect(
				runWrangler(
					`flagship flags create app-1 f --variation on=true --variation off=false --default-variation off --rule "serve=on; when="`
				)
			).rejects.toThrowError(/Condition expression is empty/);
			await expect(
				runWrangler(
					`flagship flags create app-1 f --variation on=true --variation off=false --default-variation off --rule "serve=on; when=plan equals pro OR"`
				)
			).rejects.toThrowError(
				/Logical operators must appear between conditions/
			);
		});

		it("rejects malformed rule JSON", async ({ expect }) => {
			await expect(
				runWrangler(
					`flagship flags create app-1 f --variation on=true --variation off=false --default-variation off --rule-json '{"conditions":[]}'`
				)
			).rejects.toThrowError(/serve_variation/);
		});

		it("defaults new flags to boolean on/off variations", async ({
			expect,
		}) => {
			const body = captureBody("post", "apps/app-1/flags", {
				key: "simple-flag",
				type: "boolean",
				enabled: true,
				default_variation: "off",
				variations: { on: true, off: false },
				rules: [],
			});
			await runWrangler("flagship flags create app-1 simple-flag");
			await expect(body).resolves.toMatchObject({
				default_variation: "off",
				variations: { on: true, off: false },
			});
		});

		it("lists flags and surfaces the next cursor", async ({ expect }) => {
			mockGet(
				"apps/app-1/flags",
				[
					{
						key: "new-ui",
						type: "boolean",
						enabled: true,
						default_variation: "off",
						variations: { on: true, off: false },
						rules: [],
					},
				],
				{ count: 1, cursor: "next-key" }
			);
			await runWrangler("flagship flags list app-1");
			expect(std.out).toContain("new-ui");
			expect(std.out).toContain("Next cursor: next-key");
		});

		it("renders a flag with variations and rules", async ({ expect }) => {
			mockGet("apps/app-1/flags/new-ui", {
				key: "new-ui",
				type: "boolean",
				description: "Roll out the new UI",
				enabled: true,
				default_variation: "off",
				variations: { on: true, off: false },
				rules: [
					{
						priority: 1,
						serve_variation: "on",
						conditions: [
							{ attribute: "plan", operator: "equals", value: "pro" },
						],
						rollout: { percentage: 30, attribute: "user_id" },
					},
				],
			});
			await runWrangler("flagship flags get app-1 new-ui");
			expect(std.out).toContain("new-ui");
			expect(std.out).toContain("enabled");
			expect(std.out).toContain("off  false  default");
			expect(std.out).toContain('serve "on" when plan equals "pro"');
			expect(std.out).toContain("30% rollout by user_id");
		});

		it("encodes flag keys in API paths", async ({ expect }) => {
			let url = "";
			msw.use(
				http.get(
					"*/accounts/:accountId/flagship/apps/app-1/flags/:flagKey",
					({ params, request }) => {
						url = request.url;
						expect(params.flagKey).toBe("foo/bar");
						return HttpResponse.json(
							createFetchResult(
								{
									key: "foo/bar",
									enabled: true,
									default_variation: "off",
									variations: { on: true, off: false },
									rules: [],
								},
								true
							)
						);
					},
					{ once: true }
				)
			);
			await runWrangler('flagship flags get app-1 "foo/bar"');
			expect(url).toContain("/flags/foo%2Fbar");
		});

		it("evaluates a flag with context", async ({ expect }) => {
			let url = "";
			msw.use(
				http.get(
					"*/accounts/:accountId/flagship/apps/app-1/evaluate",
					({ request }) => {
						url = request.url;
						return HttpResponse.json({
							flagKey: "new-ui",
							value: true,
							variant: "on",
							reason: "TARGETING_MATCH",
						});
					},
					{ once: true }
				)
			);
			await runWrangler(
				"flagship flags evaluate app-1 new-ui --context plan=pro --targeting-key user-1"
			);
			expect(url).toContain("flagKey=new-ui");
			expect(url).toContain("plan=pro");
			expect(url).toContain("targetingKey=user-1");
			expect(std.out).toContain("evaluated");
			expect(std.out).toContain("TARGETING_MATCH");
		});

		it("evaluates a flag from a standard API envelope", async ({ expect }) => {
			mockGet("apps/app-1/evaluate", {
				flagKey: "new-ui",
				value: true,
				variant: "on",
				reason: "DEFAULT",
			});
			await runWrangler("flagship flags evaluate app-1 new-ui");
			expect(std.out).toContain("new-ui");
			expect(std.out).toContain("true");
			expect(std.out).toContain("DEFAULT");
		});

		it("does not let context override the flag key", async ({ expect }) => {
			let url = "";
			msw.use(
				http.get(
					"*/accounts/:accountId/flagship/apps/app-1/evaluate",
					({ request }) => {
						url = request.url;
						return HttpResponse.json({ flagKey: "new-ui", value: true });
					},
					{ once: true }
				)
			);
			await runWrangler(
				"flagship flags evaluate app-1 new-ui --context flagKey=wrong"
			);
			const params = new URL(url).searchParams;
			expect(params.getAll("flagKey")).toEqual(["new-ui"]);
		});

		it("supports inspect, history, and eval aliases", async ({ expect }) => {
			mockGet("apps/app-1/flags/new-ui", {
				key: "new-ui",
				enabled: true,
				default_variation: "off",
				variations: { on: true, off: false },
				rules: [],
			});
			await runWrangler("flagship flags inspect app-1 new-ui");
			expect(std.out).toContain("new-ui");

			mockGet("apps/app-1/flags/new-ui/changelog", []);
			await runWrangler("flagship flags history app-1 new-ui");
			expect(std.out).toContain("No changelog entries");

			mockRawGet("apps/app-1/evaluate", { flagKey: "new-ui", value: false });
			await runWrangler("flagship flags eval app-1 new-ui");
			expect(std.out).toContain("new-ui");
		});

		it("toggles a flag via read-modify-write", async ({ expect }) => {
			mockGet("apps/app-1/flags/new-ui", {
				key: "new-ui",
				enabled: true,
				default_variation: "off",
				variations: { on: true, off: false },
				rules: [{ priority: 1, serve_variation: "on", conditions: [] }],
			});
			const body = captureBody("put", "apps/app-1/flags/new-ui", {
				key: "new-ui",
				type: "boolean",
				enabled: false,
				default_variation: "off",
				variations: { on: true, off: false },
				rules: [{ priority: 1, serve_variation: "on", conditions: [] }],
			});
			await runWrangler("flagship flags update app-1 new-ui --disable");
			await expect(body).resolves.toEqual({
				key: "new-ui",
				description: undefined,
				enabled: false,
				default_variation: "off",
				variations: { on: true, off: false },
				rules: [{ priority: 1, serve_variation: "on", conditions: [] }],
			});
			expect(std.out).toContain("Updated flag");
			expect(std.out).toContain("disabled");
		});

		it("deletes a flag with confirmation", async ({ expect }) => {
			mockConfirm({
				text: "Are you sure you want to delete the flag 'new-ui'?",
				result: true,
			});
			const body = captureBody("delete", "apps/app-1/flags/new-ui", {
				key: "new-ui",
			});
			await runWrangler("flagship flags delete app-1 new-ui");
			await expect(body).resolves.toBeNull();
			expect(std.out).toContain("Deleted flag 'new-ui'");
		});

		it("deletes a flag with --json (skips prompt, outputs result)", async ({
			expect,
		}) => {
			msw.use(
				http.delete(
					"*/accounts/:accountId/flagship/apps/app-1/flags/new-ui",
					() => HttpResponse.json(createFetchResult({ key: "new-ui" }, true)),
					{ once: true }
				)
			);
			await runWrangler("flagship flags delete app-1 new-ui --force --json");
			expect(JSON.parse(std.out)).toEqual({ key: "new-ui" });
		});

		it("deletes multiple flags given an app id and multiple keys", async ({
			expect,
		}) => {
			const deleted: string[] = [];
			msw.use(
				http.delete(
					"*/accounts/:accountId/flagship/apps/app-1/flags/:flagKey",
					({ params }) => {
						const key = String(params.flagKey);
						deleted.push(key);
						return HttpResponse.json(createFetchResult({ key }, true));
					}
				)
			);
			await runWrangler(
				"flagship flags delete app-1 alpha beta --force --json"
			);
			expect(deleted).toEqual(["alpha", "beta"]);
			expect(JSON.parse(std.out)).toEqual([{ key: "alpha" }, { key: "beta" }]);
		});

		it("requires an app id and at least one flag key", async ({ expect }) => {
			await expect(
				runWrangler("flagship flags delete app-1 --force")
			).rejects.toThrowError(/Not enough non-option arguments/);
		});

		it("requires --force to delete with --json", async ({ expect }) => {
			await expect(
				runWrangler("flagship flags delete app-1 new-ui --json")
			).rejects.toThrowError(/Pass --force/);
			expect(JSON.parse(std.out)).toEqual({
				error:
					"Pass --force to skip the confirmation prompt when using --json.",
			});
		});

		it("continues deleting after a failure and reports it", async ({
			expect,
		}) => {
			const deleted: string[] = [];
			msw.use(
				http.delete(
					"*/accounts/:accountId/flagship/apps/app-1/flags/:flagKey",
					({ params }) => {
						const key = String(params.flagKey);
						if (key === "beta") {
							return HttpResponse.json(
								createFetchResult(null, false, [
									{ code: 1000, message: "flag is locked" },
								]),
								{ status: 500 }
							);
						}
						deleted.push(key);
						return HttpResponse.json(createFetchResult({ key }, true));
					}
				)
			);
			await expect(
				runWrangler("flagship flags delete app-1 alpha beta gamma --force")
			).rejects.toThrowError(/Failed to process 1 of the requested items/);
			expect(deleted).toEqual(["alpha", "gamma"]);
			expect(std.out).toContain("Deleted flag 'alpha'");
			expect(std.out).toContain("Deleted flag 'gamma'");
		});

		it("reports bulk failures as JSON when using --json", async ({
			expect,
		}) => {
			msw.use(
				http.delete(
					"*/accounts/:accountId/flagship/apps/app-1/flags/:flagKey",
					({ params }) => {
						const key = String(params.flagKey);
						if (key === "beta") {
							return HttpResponse.json(
								createFetchResult(null, false, [
									{ code: 1000, message: "flag is locked" },
								]),
								{ status: 500 }
							);
						}
						return HttpResponse.json(createFetchResult({ key }, true));
					}
				)
			);
			await expect(
				runWrangler(
					"flagship flags delete app-1 alpha beta gamma --force --json"
				)
			).rejects.toThrowError(/Failed to process 1 of the requested items/);
			expect(JSON.parse(std.out)).toMatchObject({
				results: [{ key: "alpha" }, { key: "gamma" }],
				failures: [{ target: "beta" }],
			});
		});

		it("shows the flag changelog", async ({ expect }) => {
			mockGet("apps/app-1/flags/new-ui/changelog", [
				{
					flag_key: "new-ui",
					event: "create",
					after: {
						key: "new-ui",
						enabled: true,
						default_variation: "off",
						variations: { on: true, off: false },
						rules: [],
						updated_at: "2026-01-02",
						updated_by: "dev@cloudflare.com",
					},
				},
			]);
			await runWrangler("flagship flags changelog app-1 new-ui");
			expect(std.out).toContain("create");
			expect(std.out).toContain("dev@cloudflare.com");
		});

		it("enables a flag without re-specifying its definition", async ({
			expect,
		}) => {
			mockGet("apps/app-1/flags/new-ui", {
				key: "new-ui",
				enabled: false,
				default_variation: "off",
				variations: { on: true, off: false },
				rules: [],
			});
			const body = captureBody("put", "apps/app-1/flags/new-ui", {
				key: "new-ui",
				enabled: true,
				default_variation: "off",
				variations: { on: true, off: false },
				rules: [],
			});
			await runWrangler("flagship flags enable app-1 new-ui");
			await expect(body).resolves.toMatchObject({ enabled: true });
			expect(std.out).toContain("Enabled flag");
		});

		it("disables multiple flags", async ({ expect }) => {
			const updated: string[] = [];
			msw.use(
				http.get(
					"*/accounts/:accountId/flagship/apps/app-1/flags/:flagKey",
					({ params }) =>
						HttpResponse.json(
							createFetchResult(
								{
									key: String(params.flagKey),
									enabled: true,
									default_variation: "off",
									variations: { on: true, off: false },
									rules: [],
								},
								true
							)
						)
				),
				http.put(
					"*/accounts/:accountId/flagship/apps/app-1/flags/:flagKey",
					async ({ params, request }) => {
						const body = await request.json();
						expect(body).toMatchObject({ enabled: false });
						updated.push(String(params.flagKey));
						return HttpResponse.json(createFetchResult(body, true));
					}
				)
			);
			await runWrangler("flagship flags disable app-1 alpha beta --json");
			expect(updated).toEqual(["alpha", "beta"]);
			expect(JSON.parse(std.out)).toMatchObject([
				{ key: "alpha", enabled: false },
				{ key: "beta", enabled: false },
			]);
		});

		it("reports failures when a bulk toggle partially fails", async ({
			expect,
		}) => {
			msw.use(
				http.get(
					"*/accounts/:accountId/flagship/apps/app-1/flags/:flagKey",
					({ params }) => {
						const key = String(params.flagKey);
						if (key === "missing") {
							return HttpResponse.json(
								createFetchResult(null, false, [
									{ code: 1001, message: "flag not found" },
								]),
								{ status: 404 }
							);
						}
						return HttpResponse.json(
							createFetchResult(
								{
									key,
									enabled: true,
									default_variation: "off",
									variations: { on: true, off: false },
									rules: [],
								},
								true
							)
						);
					}
				),
				http.put(
					"*/accounts/:accountId/flagship/apps/app-1/flags/:flagKey",
					async ({ request }) =>
						HttpResponse.json(createFetchResult(await request.json(), true))
				)
			);
			await expect(
				runWrangler("flagship flags disable app-1 alpha missing")
			).rejects.toThrowError(/Failed to process 1 of the requested items/);
			expect(std.out).toContain("Disabled flag");
		});

		it("sets the default variation", async ({ expect }) => {
			mockGet("apps/app-1/flags/new-ui", {
				key: "new-ui",
				enabled: true,
				default_variation: "off",
				variations: { on: true, off: false },
				rules: [{ priority: 1, serve_variation: "on", conditions: [] }],
			});
			const body = captureBody("put", "apps/app-1/flags/new-ui", {
				key: "new-ui",
				enabled: true,
				default_variation: "on",
				variations: { on: true, off: false },
				rules: [],
			});
			await runWrangler(
				"flagship flags set app-1 new-ui --variation=on --clear-rules"
			);
			await expect(body).resolves.toMatchObject({
				default_variation: "on",
				rules: [],
			});
			expect(std.out).toContain('Set default variation to "on"');
		});

		it("clears the description when passed an empty string", async ({
			expect,
		}) => {
			mockGet("apps/app-1/flags/new-ui", {
				key: "new-ui",
				enabled: true,
				description: "old description",
				default_variation: "off",
				variations: { on: true, off: false },
				rules: [],
			});
			const body = captureBody("put", "apps/app-1/flags/new-ui", {
				key: "new-ui",
			});
			await runWrangler('flagship flags update app-1 new-ui --description ""');
			await expect(body).resolves.toMatchObject({ description: null });
		});

		it("configures a weighted split", async ({ expect }) => {
			mockGet("apps/app-1/flags/model", {
				key: "model",
				enabled: true,
				default_variation: "stable",
				variations: { stable: "v1", candidate: "v2" },
				rules: [],
			});
			const body = captureBody("put", "apps/app-1/flags/model", {
				key: "model",
				enabled: true,
				default_variation: "stable",
				variations: { stable: "v1", candidate: "v2" },
				rules: [],
			});
			await runWrangler(
				"flagship flags split app-1 model --by user_id --weight stable=95 --weight candidate=5"
			);
			await expect(body).resolves.toMatchObject({
				rules: [
					{
						priority: 1,
						serve_variation: "stable",
						rollout: { percentage: 95, attribute: "user_id" },
					},
					{
						priority: 2,
						serve_variation: "candidate",
						rollout: { percentage: 100, attribute: "user_id" },
					},
				],
			});
			expect(std.out).toContain("Updated split");
		});

		it("configures a single rollout", async ({ expect }) => {
			mockGet("apps/app-1/flags/new-ui", {
				key: "new-ui",
				enabled: true,
				default_variation: "off",
				variations: { on: true, off: false },
				rules: [],
			});
			const body = captureBody("put", "apps/app-1/flags/new-ui", {
				key: "new-ui",
				enabled: true,
				default_variation: "off",
				variations: { on: true, off: false },
				rules: [],
			});
			await runWrangler(
				"flagship flags rollout app-1 new-ui --to on --percentage 25 --by user_id"
			);
			await expect(body).resolves.toMatchObject({
				rules: [
					{
						priority: 1,
						serve_variation: "on",
						rollout: { percentage: 25, attribute: "user_id" },
					},
				],
			});
			expect(std.out).toContain("Updated rollout");
		});

		it("rejects a non-finite rollout percentage", async ({ expect }) => {
			await expect(
				runWrangler(
					"flagship flags rollout app-1 new-ui --to on --percentage NaN"
				)
			).rejects.toThrowError(/--percentage must be between 0 and 100/);
		});

		it("removes the rollout without changing the default when percentage is 0", async ({
			expect,
		}) => {
			mockGet("apps/app-1/flags/new-ui", {
				key: "new-ui",
				enabled: true,
				default_variation: "off",
				variations: { on: true, off: false },
				rules: [
					{
						priority: 1,
						serve_variation: "on",
						conditions: [],
						rollout: { percentage: 25, attribute: "user_id" },
					},
				],
			});
			const body = captureBody("put", "apps/app-1/flags/new-ui", {
				key: "new-ui",
			});
			await runWrangler(
				"flagship flags rollout app-1 new-ui --to on --percentage 0 --from on"
			);
			await expect(body).resolves.toMatchObject({
				default_variation: "off",
				rules: [],
			});
		});

		it("asks for confirmation before a rollout replaces targeting rules with conditions", async ({
			expect,
		}) => {
			mockGet("apps/app-1/flags/new-ui", {
				key: "new-ui",
				enabled: true,
				default_variation: "off",
				variations: { on: true, off: false },
				rules: [
					{
						priority: 1,
						serve_variation: "on",
						conditions: [
							{ attribute: "plan", operator: "equals", value: "pro" },
						],
					},
				],
			});
			mockConfirm({
				text: "This flag has existing targeting rule(s) with conditions. Continuing will replace them with this rollout. Continue?",
				result: false,
			});
			await runWrangler(
				"flagship flags rollout app-1 new-ui --to on --percentage 25"
			);
			expect(std.out).toContain("Aborting rollout");
		});

		it("skips the rollout confirmation with --force", async ({ expect }) => {
			mockGet("apps/app-1/flags/new-ui", {
				key: "new-ui",
				enabled: true,
				default_variation: "off",
				variations: { on: true, off: false },
				rules: [
					{
						priority: 1,
						serve_variation: "on",
						conditions: [
							{ attribute: "plan", operator: "equals", value: "pro" },
						],
					},
				],
			});
			const body = captureBody("put", "apps/app-1/flags/new-ui", {
				key: "new-ui",
			});
			await runWrangler(
				"flagship flags rollout app-1 new-ui --to on --percentage 25 --force"
			);
			await expect(body).resolves.toMatchObject({
				rules: [{ priority: 1, serve_variation: "on" }],
			});
		});

		it("requires --force to replace targeting rules with --json", async ({
			expect,
		}) => {
			mockGet("apps/app-1/flags/new-ui", {
				key: "new-ui",
				enabled: true,
				default_variation: "off",
				variations: { on: true, off: false },
				rules: [
					{
						priority: 1,
						serve_variation: "on",
						conditions: [
							{ attribute: "plan", operator: "equals", value: "pro" },
						],
					},
				],
			});
			await expect(
				runWrangler(
					"flagship flags rollout app-1 new-ui --to on --percentage 25 --json"
				)
			).rejects.toThrowError(/Pass --force to confirm/);
		});

		it("asks for confirmation before a split replaces targeting rules with conditions", async ({
			expect,
		}) => {
			mockGet("apps/app-1/flags/model", {
				key: "model",
				enabled: true,
				default_variation: "stable",
				variations: { stable: "v1", candidate: "v2" },
				rules: [
					{
						priority: 1,
						serve_variation: "stable",
						conditions: [
							{ attribute: "plan", operator: "equals", value: "pro" },
						],
					},
				],
			});
			mockConfirm({
				text: "This flag has existing targeting rule(s) with conditions. Continuing will replace them with this split. Continue?",
				result: false,
			});
			await runWrangler(
				"flagship flags split app-1 model -w stable=50 -w candidate=50"
			);
			expect(std.out).toContain("Aborting split");
		});

		it("supports the ls alias", async ({ expect }) => {
			mockGet("apps/app-1/flags", []);
			await runWrangler("flagship flags ls app-1");
			expect(std.out).toContain("No flags in this app yet");
		});
	});

	describe("rule parsing and validation", () => {
		it("detects the operator by position, not list order", async ({
			expect,
		}) => {
			const body = captureBody("post", "apps/app-1/flags", { key: "f" });
			await runWrangler(
				`flagship flags create app-1 f -V on=true -V off=false --default off --rule "serve=on; when=desc contains x equals y"`
			);
			await expect(body).resolves.toMatchObject({
				rules: [
					{
						conditions: [
							{ attribute: "desc", operator: "contains", value: "x equals y" },
						],
					},
				],
			});
		});

		it("parses OR groups into a nested condition", async ({ expect }) => {
			const body = captureBody("post", "apps/app-1/flags", { key: "f" });
			await runWrangler(
				`flagship flags create app-1 f -V on=true -V off=false --default off --rule "serve=on; when=plan equals pro OR plan equals team"`
			);
			await expect(body).resolves.toMatchObject({
				rules: [
					{
						conditions: [
							{
								logical_operator: "OR",
								clauses: [
									{ attribute: "plan", operator: "equals", value: "pro" },
									{ attribute: "plan", operator: "equals", value: "team" },
								],
							},
						],
					},
				],
			});
		});

		it("gives AND higher precedence than OR", async ({ expect }) => {
			const body = captureBody("post", "apps/app-1/flags", { key: "f" });
			await runWrangler(
				`flagship flags create app-1 f -V on=true -V off=false --default off --rule "serve=on; when=a equals 1 AND b equals 2 OR c equals 3"`
			);
			await expect(body).resolves.toMatchObject({
				rules: [
					{
						conditions: [
							{
								logical_operator: "OR",
								clauses: [
									{
										logical_operator: "AND",
										clauses: [
											{ attribute: "a", operator: "equals", value: 1 },
											{ attribute: "b", operator: "equals", value: 2 },
										],
									},
									{ attribute: "c", operator: "equals", value: 3 },
								],
							},
						],
					},
				],
			});
		});

		it("auto-assigns rule priorities by declaration order", async ({
			expect,
		}) => {
			const body = captureBody("post", "apps/app-1/flags", { key: "f" });
			await runWrangler(
				`flagship flags create app-1 f -V on=true -V off=false --default off --rule "serve=on; when=plan equals pro" --rule "serve=off; when=plan equals free"`
			);
			await expect(body).resolves.toMatchObject({
				rules: [
					{ priority: 1, serve_variation: "on" },
					{ priority: 2, serve_variation: "off" },
				],
			});
		});

		it("rejects duplicate rule priorities", async ({ expect }) => {
			await expect(
				runWrangler(
					`flagship flags create app-1 f -V on=true -V off=false --default off --rule "priority=1; serve=on; when=plan equals pro" --rule "priority=1; serve=off; when=plan equals free"`
				)
			).rejects.toThrowError(/Duplicate rule priority 1/);
		});

		it("rejects a default variation that is not defined", async ({
			expect,
		}) => {
			await expect(
				runWrangler(
					"flagship flags create app-1 f -V on=true -V off=false --default nope"
				)
			).rejects.toThrowError(/Default variation "nope" is not one of/);
		});

		it("rejects a rule that serves an unknown variation", async ({
			expect,
		}) => {
			await expect(
				runWrangler(
					`flagship flags create app-1 f -V on=true -V off=false --default off --rule "serve=maybe; when=plan equals pro"`
				)
			).rejects.toThrowError(/serves unknown variation "maybe"/);
		});

		it("treats lowercase and/or inside a value literally", async ({
			expect,
		}) => {
			const body = captureBody("post", "apps/app-1/flags", { key: "f" });
			await runWrangler(
				`flagship flags create app-1 f -V on=true -V off=false --default off --rule "serve=on; when=name equals tom and jerry"`
			);
			await expect(body).resolves.toMatchObject({
				rules: [
					{
						conditions: [
							{
								attribute: "name",
								operator: "equals",
								value: "tom and jerry",
							},
						],
					},
				],
			});
		});

		it("keeps numeric-looking values that do not round-trip as strings", async ({
			expect,
		}) => {
			const body = captureBody("post", "apps/app-1/flags", { key: "f" });
			await runWrangler(
				`flagship flags create app-1 f -V on=true -V off=false --default off --rule "serve=on; when=code equals 007"`
			);
			await expect(body).resolves.toMatchObject({
				rules: [
					{
						conditions: [
							{ attribute: "code", operator: "equals", value: "007" },
						],
					},
				],
			});
		});

		it("treats quoted values literally, including reserved words", async ({
			expect,
		}) => {
			const body = captureBody("post", "apps/app-1/flags", { key: "f" });
			await runWrangler(
				`flagship flags create app-1 f -V on=true -V off=false --default off --rule 'serve=on; when=title equals "WAR AND PEACE" OR title equals "tom; jerry"'`
			);
			await expect(body).resolves.toMatchObject({
				rules: [
					{
						conditions: [
							{
								logical_operator: "OR",
								clauses: [
									{
										attribute: "title",
										operator: "equals",
										value: "WAR AND PEACE",
									},
									{
										attribute: "title",
										operator: "equals",
										value: "tom; jerry",
									},
								],
							},
						],
					},
				],
			});
		});

		it("does not split on AND/OR inside a bracketed list", async ({
			expect,
		}) => {
			const body = captureBody("post", "apps/app-1/flags", { key: "f" });
			await runWrangler(
				`flagship flags create app-1 f -V on=true -V off=false --default off --rule 'serve=on; when=country in ["AND","OR"]'`
			);
			await expect(body).resolves.toMatchObject({
				rules: [
					{
						conditions: [
							{ attribute: "country", operator: "in", value: ["AND", "OR"] },
						],
					},
				],
			});
		});

		it("rejects an unterminated quote in a condition", async ({ expect }) => {
			await expect(
				runWrangler(
					`flagship flags create app-1 f -V on=true -V off=false --default off --rule 'serve=on; when=title equals "oops'`
				)
			).rejects.toThrowError(/Unterminated double quote/);
		});

		it("rejects a malformed bracketed list", async ({ expect }) => {
			await expect(
				runWrangler(
					`flagship flags create app-1 f -V on=true -V off=false --default off --rule "serve=on; when=country in [US,CA"`
				)
			).rejects.toThrowError(/Unterminated "\["/);
		});

		it("rejects an empty list item", async ({ expect }) => {
			await expect(
				runWrangler(
					`flagship flags create app-1 f -V on=true -V off=false --default off --rule "serve=on; when=country in [US,,CA]"`
				)
			).rejects.toThrowError(/List items must not be empty/);
		});

		it("rejects a condition with no value", async ({ expect }) => {
			await expect(
				runWrangler(
					`flagship flags create app-1 f -V on=true -V off=false --default off --rule "serve=on; when=plan equals"`
				)
			).rejects.toThrowError(/Could not find a valid operator|missing a value/);
		});

		it("rejects a rollout with multiple @ separators", async ({ expect }) => {
			await expect(
				runWrangler(
					`flagship flags create app-1 f -V on=true -V off=false --default off --rule "serve=on; rollout=30%@user@id"`
				)
			).rejects.toThrowError(/single non-empty attribute/);
		});

		it("rejects a rollout with an empty percentage", async ({ expect }) => {
			await expect(
				runWrangler(
					`flagship flags create app-1 f -V on=true -V off=false --default off --rule "serve=on; rollout=@user_id"`
				)
			).rejects.toThrowError(/Expected a percentage between 0 and 100/);
		});

		it("rejects duplicate variation names", async ({ expect }) => {
			await expect(
				runWrangler(
					"flagship flags create app-1 f -V on=true -V on=false --default on"
				)
			).rejects.toThrowError(/Duplicate variation "on"/);
		});

		it("rejects a non-finite number variation", async ({ expect }) => {
			await expect(
				runWrangler(
					"flagship flags create app-1 f --type number -V big=Infinity --default big"
				)
			).rejects.toThrowError(/not a valid finite number/);
		});

		it("rejects variations with inconsistent inferred types", async ({
			expect,
		}) => {
			await expect(
				runWrangler(
					"flagship flags create app-1 f -V a=true -V b=5 --default a"
				)
			).rejects.toThrowError(
				/Variation "b" is number but variation "a" is boolean/
			);
		});

		it("rejects --set-variation introducing an inconsistent type", async ({
			expect,
		}) => {
			mockGet("apps/app-1/flags/f", {
				key: "f",
				enabled: true,
				default_variation: "on",
				variations: { on: true, off: false },
				rules: [],
			});
			await expect(
				runWrangler("flagship flags update app-1 f --set-variation extra=5")
			).rejects.toThrowError(
				/Variation "extra" is number but variation "on" is boolean/
			);
		});

		it("rejects unknown fields in --rule-json", async ({ expect }) => {
			await expect(
				runWrangler(
					`flagship flags create app-1 f -V on=true -V off=false --default off --rule-json '{"serve_variation":"on","conditions":[],"bogus":1}'`
				)
			).rejects.toThrowError(/Unexpected field "bogus"/);
		});

		it("rejects a --rule-json condition mixing logical and base fields", async ({
			expect,
		}) => {
			await expect(
				runWrangler(
					`flagship flags create app-1 f -V on=true -V off=false --default off --rule-json '{"serve_variation":"on","conditions":[{"logical_operator":"AND","clauses":[],"attribute":"x"}]}'`
				)
			).rejects.toThrowError(/Unexpected field "attribute"/);
		});
	});

	describe("split validation", () => {
		it("rejects duplicate split weights", async ({ expect }) => {
			mockGet("apps/app-1/flags/model", {
				key: "model",
				enabled: true,
				default_variation: "a",
				variations: { a: "1", b: "2" },
				rules: [],
			});
			await expect(
				runWrangler("flagship flags split app-1 model -w a=10 -w a=90")
			).rejects.toThrowError(/Duplicate weight for variation "a"/);
		});

		it("rejects a non-finite split weight", async ({ expect }) => {
			mockGet("apps/app-1/flags/model", {
				key: "model",
				enabled: true,
				default_variation: "a",
				variations: { a: "1", b: "2" },
				rules: [],
			});
			await expect(
				runWrangler("flagship flags split app-1 model -w a=Infinity -w b=10")
			).rejects.toThrowError(/non-negative finite number/);
		});
	});

	describe("incremental rule editing", () => {
		it("appends a rule with --add-rule, keeping existing rules", async ({
			expect,
		}) => {
			mockGet("apps/app-1/flags/new-ui", {
				key: "new-ui",
				enabled: true,
				default_variation: "off",
				variations: { on: true, off: false },
				rules: [{ priority: 1, serve_variation: "on", conditions: [] }],
			});
			const body = captureBody("put", "apps/app-1/flags/new-ui", {
				key: "new-ui",
			});
			await runWrangler(
				`flagship flags update app-1 new-ui --add-rule "serve=off; when=plan equals free"`
			);
			await expect(body).resolves.toMatchObject({
				rules: [
					{ priority: 1, serve_variation: "on" },
					{
						priority: 2,
						serve_variation: "off",
						conditions: [
							{ attribute: "plan", operator: "equals", value: "free" },
						],
					},
				],
			});
		});

		it("rejects replacing and appending rules in the same command", async ({
			expect,
		}) => {
			mockGet("apps/app-1/flags/new-ui", {
				key: "new-ui",
				enabled: true,
				default_variation: "off",
				variations: { on: true, off: false },
				rules: [],
			});
			await expect(
				runWrangler(
					`flagship flags update app-1 new-ui --rule "serve=on; when=plan equals pro" --add-rule "serve=off; when=plan equals free"`
				)
			).rejects.toThrowError(/Cannot replace rules .* and append rules/);
		});

		it("lists rules for a flag", async ({ expect }) => {
			mockGet("apps/app-1/flags/new-ui", {
				key: "new-ui",
				enabled: true,
				default_variation: "off",
				variations: { on: true, off: false },
				rules: [
					{
						priority: 1,
						serve_variation: "on",
						conditions: [
							{ attribute: "plan", operator: "equals", value: "pro" },
						],
						rollout: { percentage: 25, attribute: "user_id" },
					},
				],
			});
			await runWrangler("flagship flags rules list app-1 new-ui");
			expect(std.out).toContain("priority");
			expect(std.out).toContain("25%@user_id");
			expect(std.out).toContain("plan equals");
		});

		it("updates one rule rollout by priority", async ({ expect }) => {
			mockGet("apps/app-1/flags/new-ui", {
				key: "new-ui",
				enabled: true,
				default_variation: "off",
				variations: { on: true, off: false },
				rules: [
					{
						priority: 1,
						serve_variation: "on",
						conditions: [],
						rollout: { percentage: 25, attribute: "user_id" },
					},
					{ priority: 2, serve_variation: "off", conditions: [] },
				],
			});
			const body = captureBody("put", "apps/app-1/flags/new-ui", {
				key: "new-ui",
			});
			await runWrangler(
				"flagship flags rules update app-1 new-ui --priority 1 --rollout 50%@user_id"
			);
			await expect(body).resolves.toMatchObject({
				rules: [
					{
						priority: 1,
						serve_variation: "on",
						rollout: { percentage: 50, attribute: "user_id" },
					},
					{ priority: 2, serve_variation: "off" },
				],
			});
		});

		it("deletes one rule by priority", async ({ expect }) => {
			mockGet("apps/app-1/flags/new-ui", {
				key: "new-ui",
				enabled: true,
				default_variation: "off",
				variations: { on: true, off: false },
				rules: [
					{ priority: 1, serve_variation: "on", conditions: [] },
					{ priority: 2, serve_variation: "off", conditions: [] },
				],
			});
			const body = captureBody("put", "apps/app-1/flags/new-ui", {
				key: "new-ui",
			});
			await runWrangler(
				"flagship flags rules delete app-1 new-ui --priority 2"
			);
			await expect(body).resolves.toMatchObject({
				rules: [{ priority: 1, serve_variation: "on" }],
			});
		});

		it("renumbers rules after deleting a middle priority", async ({
			expect,
		}) => {
			mockGet("apps/app-1/flags/new-ui", {
				key: "new-ui",
				enabled: true,
				default_variation: "off",
				variations: { on: true, off: false, beta: true },
				rules: [
					{ priority: 1, serve_variation: "on", conditions: [] },
					{ priority: 2, serve_variation: "off", conditions: [] },
					{ priority: 3, serve_variation: "beta", conditions: [] },
				],
			});
			const body = captureBody("put", "apps/app-1/flags/new-ui", {
				key: "new-ui",
			});
			await runWrangler(
				"flagship flags rules delete app-1 new-ui --priority 2"
			);
			await expect(body).resolves.toMatchObject({
				rules: [
					{ priority: 1, serve_variation: "on" },
					{ priority: 2, serve_variation: "beta" },
				],
			});
		});

		it("reorders rules by existing priority", async ({ expect }) => {
			mockGet("apps/app-1/flags/new-ui", {
				key: "new-ui",
				enabled: true,
				default_variation: "off",
				variations: { on: true, off: false },
				rules: [
					{ priority: 1, serve_variation: "on", conditions: [] },
					{ priority: 2, serve_variation: "off", conditions: [] },
				],
			});
			const body = captureBody("put", "apps/app-1/flags/new-ui", {
				key: "new-ui",
			});
			await runWrangler(
				"flagship flags rules reorder app-1 new-ui --order 2,1"
			);
			await expect(body).resolves.toMatchObject({
				rules: [
					{ priority: 1, serve_variation: "off" },
					{ priority: 2, serve_variation: "on" },
				],
			});
		});

		it("rejects invalid reorder entries", async ({ expect }) => {
			mockGet("apps/app-1/flags/new-ui", {
				key: "new-ui",
				enabled: true,
				default_variation: "off",
				variations: { on: true, off: false },
				rules: [
					{ priority: 1, serve_variation: "on", conditions: [] },
					{ priority: 2, serve_variation: "off", conditions: [] },
				],
			});
			await expect(
				runWrangler("flagship flags rules reorder app-1 new-ui --order 1,wat,2")
			).rejects.toThrowError(/Invalid --order/);
		});

		it("rejects duplicate and extra reorder priorities", async ({ expect }) => {
			const flag = {
				key: "new-ui",
				enabled: true,
				default_variation: "off",
				variations: { on: true, off: false },
				rules: [
					{ priority: 1, serve_variation: "on", conditions: [] },
					{ priority: 2, serve_variation: "off", conditions: [] },
				],
			};
			mockGet("apps/app-1/flags/new-ui", flag);
			await expect(
				runWrangler("flagship flags rules reorder app-1 new-ui --order 1,2,1")
			).rejects.toThrowError(/must contain each existing rule priority/);

			mockGet("apps/app-1/flags/new-ui", flag);
			await expect(
				runWrangler("flagship flags rules reorder app-1 new-ui --order 1,2,3")
			).rejects.toThrowError(/must contain each existing rule priority/);
		});
	});

	describe("pagination", () => {
		it("allows --limit without treating default --all=false as a conflict", async ({
			expect,
		}) => {
			mockGet(
				"apps/app-1/flags/new-ui/changelog",
				[
					{
						flag_key: "new-ui",
						event: "create",
						after: { updated_by: "a@b.c" },
					},
				],
				{ count: 1, cursor: null }
			);
			await runWrangler("flagship flags changelog app-1 new-ui --limit 3");
			expect(std.out).toContain("create");
		});

		it("rejects --all with explicit pagination options", async ({ expect }) => {
			await expect(
				runWrangler("flagship flags changelog app-1 new-ui --all --limit 3")
			).rejects.toThrowError(/Cannot use --all together with --limit/);
		});

		it("rejects invalid pagination limits", async ({ expect }) => {
			await expect(
				runWrangler("flagship flags list app-1 --limit 0")
			).rejects.toThrowError(/Invalid --limit/);
			await expect(
				runWrangler("flagship flags changelog app-1 new-ui --limit 201")
			).rejects.toThrowError(/Invalid --limit/);
		});

		it("follows the cursor with --all when listing flags", async ({
			expect,
		}) => {
			mockPaged("apps/app-1/flags", [
				{
					items: [
						{ key: "a", enabled: true, default_variation: "off", rules: [] },
					],
					cursor: "page-2",
				},
				{
					items: [
						{ key: "b", enabled: true, default_variation: "off", rules: [] },
					],
					cursor: null,
				},
			]);
			await runWrangler("flagship flags list app-1 --all");
			expect(std.out).toContain("a");
			expect(std.out).toContain("b");
			expect(std.out).not.toContain("Next cursor");
		});

		it("follows the cursor with --all when reading the changelog", async ({
			expect,
		}) => {
			mockPaged("apps/app-1/flags/new-ui/changelog", [
				{
					items: [
						{
							flag_key: "new-ui",
							event: "create",
							after: { updated_by: "a@b.c" },
						},
					],
					cursor: "page-2",
				},
				{
					items: [
						{
							flag_key: "new-ui",
							event: "delete",
							after: { updated_by: "d@e.f" },
						},
					],
					cursor: null,
				},
			]);
			await runWrangler("flagship flags changelog app-1 new-ui --all");
			expect(std.out).toContain("create");
			expect(std.out).toContain("delete");
			expect(std.out).not.toContain("Next cursor");
		});
	});

	describe("app id is required", () => {
		it("requires an app id for flags list", async ({ expect }) => {
			await expect(runWrangler("flagship flags list")).rejects.toThrowError(
				"Not enough non-option arguments: got 0, need at least 1"
			);
		});

		it("requires an app id for apps get", async ({ expect }) => {
			await expect(runWrangler("flagship apps get")).rejects.toThrowError(
				"Not enough non-option arguments: got 0, need at least 1"
			);
		});
	});
});
