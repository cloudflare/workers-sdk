import { Miniflare } from "miniflare";
import { afterAll, beforeAll, describe, test } from "vitest";
import { CorePaths } from "../../../src/workers/core/constants";
import {
	zFlagshipCreateFlagResponse,
	zFlagshipDeleteFlagResponse,
	zFlagshipEvaluateFlagResponse,
	zFlagshipGetFlagResponse,
	zFlagshipListAppsResponse,
	zFlagshipListFlagsResponse,
	zFlagshipUpdateFlagResponse,
} from "../../../src/workers/local-explorer/generated/zod.gen";
import { disposeWithRetry, singleModuleManifest } from "../../test-shared";
import { expectValidResponse } from "./helpers";
import type { FlagshipAdmin } from "miniflare";

const BASE_URL = `http://localhost${CorePaths.EXPLORER}/api`;

const BOOLEAN_FLAG = {
	key: "new-ui",
	enabled: true,
	default_variation: "off",
	variations: { on: true, off: false },
	rules: [],
};

describe("Flagship API", () => {
	let mf: Miniflare;
	let admin: FlagshipAdmin;

	/**
	 * Sends a PATCH to a local flag and drains the response body, which
	 * `dispatchFetch` requires callers to consume immediately.
	 */
	async function patchFlag(flagKey: string, body: unknown): Promise<number> {
		const response = await mf.dispatchFetch(
			`${BASE_URL}/flagship/apps/app-1/flags/${flagKey}`,
			{
				method: "PATCH",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify(body),
			}
		);
		await response.body?.cancel();
		return response.status;
	}

	beforeAll(async () => {
		mf = new Miniflare({
			inspectorPort: 0,
			unsafeLocalExplorer: true,
			workers: [
				{
					config: {
						type: "worker",
						name: "",
						compatibilityDate: "2025-01-01",
						manifest: singleModuleManifest(
							`export default { fetch() { return new Response("user worker"); } }`
						),
						env: {
							FLAGS: { type: "flagship", id: "app-1" },
							ALIAS: { type: "flagship", id: "app-1" },
							OTHER: { type: "flagship", id: "app-2" },
						},
					},
				},
			],
		});
		admin = (await mf.getFlagshipBindingAPI("FLAGS"))();
		await admin.putFlag(BOOLEAN_FLAG);
	});

	afterAll(async () => {
		await disposeWithRetry(mf);
	});

	describe("GET /flagship/apps", () => {
		test("lists locally simulated apps with the bindings using them", async ({
			expect,
		}) => {
			const response = await mf.dispatchFetch(`${BASE_URL}/flagship/apps`);
			const data = await expectValidResponse(
				response,
				zFlagshipListAppsResponse,
				expect
			);

			expect(data.result).toEqual([
				{ id: "app-1", bindings: ["FLAGS", "ALIAS"] },
				{ id: "app-2", bindings: ["OTHER"] },
			]);
		});
	});

	describe("GET /flagship/apps/:app_id/flags", () => {
		test("lists the flags in an app", async ({ expect }) => {
			const response = await mf.dispatchFetch(
				`${BASE_URL}/flagship/apps/app-1/flags`
			);
			const data = await expectValidResponse(
				response,
				zFlagshipListFlagsResponse,
				expect
			);

			expect(data.result).toMatchObject([
				{ key: "new-ui", type: "boolean", enabled: true },
			]);
		});

		test("does not leak flags between apps sharing an instance", async ({
			expect,
		}) => {
			const response = await mf.dispatchFetch(
				`${BASE_URL}/flagship/apps/app-2/flags`
			);
			const data = await expectValidResponse(
				response,
				zFlagshipListFlagsResponse,
				expect
			);

			expect(data.result).toEqual([]);
		});

		test("reports an app that is not simulated locally", async ({ expect }) => {
			const response = await mf.dispatchFetch(
				`${BASE_URL}/flagship/apps/absent/flags`
			);

			expect(response.status).toBe(404);
			await response.body?.cancel();
		});
	});

	describe("POST /flagship/apps/:app_id/flags", () => {
		test("creates a flag the binding can immediately evaluate", async ({
			expect,
		}) => {
			const response = await mf.dispatchFetch(
				`${BASE_URL}/flagship/apps/app-1/flags`,
				{
					method: "POST",
					headers: { "Content-Type": "application/json" },
					body: JSON.stringify({
						key: "created-flag",
						description: "made in the explorer",
						enabled: true,
						default_variation: "on",
						variations: { on: "yes", off: "no" },
					}),
				}
			);
			const data = await expectValidResponse(
				response,
				zFlagshipCreateFlagResponse,
				expect
			);

			expect(data.result).toMatchObject({
				key: "created-flag",
				type: "string",
				enabled: true,
				default_variation: "on",
			});
			expect(await admin.evaluateFlag("created-flag")).toMatchObject({
				value: "yes",
			});

			await admin.deleteFlag("created-flag");
		});

		test("defaults enabled to false and creates no rules", async ({
			expect,
		}) => {
			const response = await mf.dispatchFetch(
				`${BASE_URL}/flagship/apps/app-1/flags`,
				{
					method: "POST",
					headers: { "Content-Type": "application/json" },
					body: JSON.stringify({
						key: "quiet-flag",
						default_variation: "off",
						variations: { on: true, off: false },
					}),
				}
			);
			await expectValidResponse(response, zFlagshipCreateFlagResponse, expect);

			expect(await admin.getFlag("quiet-flag")).toMatchObject({
				enabled: false,
				rules: [],
			});

			await admin.deleteFlag("quiet-flag");
		});

		test("rejects a duplicate key", async ({ expect }) => {
			const response = await mf.dispatchFetch(
				`${BASE_URL}/flagship/apps/app-1/flags`,
				{
					method: "POST",
					headers: { "Content-Type": "application/json" },
					body: JSON.stringify({
						key: "new-ui",
						default_variation: "off",
						variations: { on: true, off: false },
					}),
				}
			);

			expect(response.status).toBe(400);
			expect(await response.json()).toMatchObject({
				success: false,
				errors: [{ message: "Flag 'new-ui' already exists" }],
			});
		});

		test("rejects a default variation that is not defined", async ({
			expect,
		}) => {
			const response = await mf.dispatchFetch(
				`${BASE_URL}/flagship/apps/app-1/flags`,
				{
					method: "POST",
					headers: { "Content-Type": "application/json" },
					body: JSON.stringify({
						key: "bad-default",
						default_variation: "missing",
						variations: { on: true, off: false },
					}),
				}
			);

			expect(response.status).toBe(400);
			expect(await response.json()).toMatchObject({
				success: false,
				errors: [
					{
						message:
							"Flag 'bad-default' default variation 'missing' is not defined",
					},
				],
			});
		});

		test("rejects variations of mixed types", async ({ expect }) => {
			const response = await mf.dispatchFetch(
				`${BASE_URL}/flagship/apps/app-1/flags`,
				{
					method: "POST",
					headers: { "Content-Type": "application/json" },
					body: JSON.stringify({
						key: "mixed",
						default_variation: "on",
						variations: { on: true, off: "no" },
					}),
				}
			);

			expect(response.status).toBe(400);
			expect(await response.json()).toMatchObject({ success: false });
		});

		test("404s for an app that is not simulated locally", async ({
			expect,
		}) => {
			const response = await mf.dispatchFetch(
				`${BASE_URL}/flagship/apps/nope/flags`,
				{
					method: "POST",
					headers: { "Content-Type": "application/json" },
					body: JSON.stringify({
						key: "whatever",
						default_variation: "off",
						variations: { off: false },
					}),
				}
			);

			expect(response.status).toBe(404);
			await response.body?.cancel();
		});
	});

	describe("POST /flagship/apps/:app_id/flags with malformed conditions", () => {
		/**
		 * Creates a flag whose single rule carries the given conditions.
		 *
		 * @returns The API response body's first error message
		 */
		async function create(conditions: unknown): Promise<string | undefined> {
			const response = await mf.dispatchFetch(
				`${BASE_URL}/flagship/apps/app-1/flags`,
				{
					method: "POST",
					headers: { "Content-Type": "application/json" },
					body: JSON.stringify({
						key: "malformed",
						default_variation: "off",
						variations: { on: true, off: false },
						rules: [{ priority: 1, serve_variation: "on", conditions }],
					}),
				}
			);
			const body = (await response.json()) as {
				errors?: Array<{ message?: string }>;
			};
			return body.errors?.[0]?.message;
		}

		test("rejects a logical condition without clauses", async ({ expect }) => {
			expect(await create([{ logical_operator: "AND" }])).toBe(
				"Flag 'malformed' has a 'AND' condition without a list of clauses"
			);
		});

		test("rejects an unknown logical operator", async ({ expect }) => {
			expect(await create([{ logical_operator: "XOR", clauses: [] }])).toBe(
				"Flag 'malformed' has a condition with an unknown logical operator 'XOR'"
			);
		});

		test("rejects an unknown comparison operator", async ({ expect }) => {
			expect(
				await create([{ attribute: "plan", operator: "??", value: "pro" }])
			).toBe("Flag 'malformed' has a condition with an unknown operator '??'");
		});

		test("rejects a condition without an attribute", async ({ expect }) => {
			expect(await create([{ operator: "equals", value: "pro" }])).toBe(
				"Flag 'malformed' has a condition without an attribute to match on"
			);
		});

		test("rejects a list operator whose value is not a list", async ({
			expect,
		}) => {
			expect(
				await create([{ attribute: "plan", operator: "in", value: "pro" }])
			).toBe("Flag 'malformed' has a 'in' condition whose value is not a list");
		});

		test("leaves the store unchanged", async ({ expect }) => {
			await create([{ logical_operator: "AND" }]);

			expect((await admin.listFlags()).map((flag) => flag.key)).not.toContain(
				"malformed"
			);
		});
	});

	describe("GET /flagship/apps/:app_id/flags/:flag_key", () => {
		test("returns a single flag", async ({ expect }) => {
			const response = await mf.dispatchFetch(
				`${BASE_URL}/flagship/apps/app-1/flags/new-ui`
			);
			const data = await expectValidResponse(
				response,
				zFlagshipGetFlagResponse,
				expect
			);

			expect(data.result).toMatchObject({
				key: "new-ui",
				default_variation: "off",
				variations: { on: true, off: false },
			});
		});

		test("returns 404 for a missing flag", async ({ expect }) => {
			const response = await mf.dispatchFetch(
				`${BASE_URL}/flagship/apps/app-1/flags/absent`
			);

			expect(response.status).toBe(404);
			await response.body?.cancel();
		});
	});

	describe("POST /flagship/apps/:app_id/flags with rules", () => {
		test("creates a flag with targeting rules", async ({ expect }) => {
			const response = await mf.dispatchFetch(
				`${BASE_URL}/flagship/apps/app-1/flags`,
				{
					method: "POST",
					headers: { "Content-Type": "application/json" },
					body: JSON.stringify({
						key: "with-rules",
						enabled: true,
						default_variation: "off",
						variations: { on: true, off: false },
						rules: [
							{
								priority: 1,
								conditions: [
									{ attribute: "country", operator: "in", value: ["NZ"] },
								],
								serve_variation: "on",
							},
						],
					}),
				}
			);
			const data = await expectValidResponse(
				response,
				zFlagshipCreateFlagResponse,
				expect
			);

			expect(data.result?.rules).toMatchObject([
				{ priority: 1, serve_variation: "on" },
			]);
			expect(
				await admin.evaluateFlag("with-rules", { country: "NZ" })
			).toMatchObject({ variant: "on" });

			await admin.deleteFlag("with-rules");
		});
	});

	describe("PATCH /flagship/apps/:app_id/flags/:flag_key", () => {
		test("toggles a flag and the change is visible to the binding", async ({
			expect,
		}) => {
			const response = await mf.dispatchFetch(
				`${BASE_URL}/flagship/apps/app-1/flags/new-ui`,
				{
					method: "PATCH",
					headers: { "Content-Type": "application/json" },
					body: JSON.stringify({ enabled: false }),
				}
			);
			const data = await expectValidResponse(
				response,
				zFlagshipUpdateFlagResponse,
				expect
			);

			expect(data.result).toMatchObject({ enabled: false });
			// The explorer writes to the same store the Worker reads from.
			expect(await admin.getFlag("new-ui")).toMatchObject({ enabled: false });

			await admin.updateFlag("new-ui", BOOLEAN_FLAG);
		});

		test("leaves fields the request omits untouched", async ({ expect }) => {
			await admin.patchFlag("new-ui", { description: "set by another writer" });

			const response = await mf.dispatchFetch(
				`${BASE_URL}/flagship/apps/app-1/flags/new-ui`,
				{
					method: "PATCH",
					headers: { "Content-Type": "application/json" },
					body: JSON.stringify({ enabled: false }),
				}
			);
			await response.text();

			expect(await admin.getFlag("new-ui")).toMatchObject({
				description: "set by another writer",
				enabled: false,
			});

			await admin.updateFlag("new-ui", BOOLEAN_FLAG);
		});

		test("accepts a fractional rollout percentage", async ({ expect }) => {
			const response = await mf.dispatchFetch(
				`${BASE_URL}/flagship/apps/app-1/flags/new-ui`,
				{
					method: "PATCH",
					headers: { "Content-Type": "application/json" },
					body: JSON.stringify({
						rules: [
							{
								priority: 1,
								serve_variation: "on",
								conditions: [],
								rollout: { percentage: 33.333333 },
							},
						],
					}),
				}
			);
			await response.text();

			expect(response.status).toBe(200);
			expect(
				(await admin.getFlag("new-ui")).rules[0]?.rollout?.percentage
			).toBe(33.333333);

			await admin.updateFlag("new-ui", BOOLEAN_FLAG);
		});

		test("changes the default variation", async ({ expect }) => {
			const response = await mf.dispatchFetch(
				`${BASE_URL}/flagship/apps/app-1/flags/new-ui`,
				{
					method: "PATCH",
					headers: { "Content-Type": "application/json" },
					body: JSON.stringify({ default_variation: "on" }),
				}
			);
			const data = await expectValidResponse(
				response,
				zFlagshipUpdateFlagResponse,
				expect
			);

			expect(data.result).toMatchObject({ default_variation: "on" });

			await admin.updateFlag("new-ui", BOOLEAN_FLAG);
		});

		test("rejects a variation the flag does not define", async ({ expect }) => {
			const response = await mf.dispatchFetch(
				`${BASE_URL}/flagship/apps/app-1/flags/new-ui`,
				{
					method: "PATCH",
					headers: { "Content-Type": "application/json" },
					body: JSON.stringify({ default_variation: "nope" }),
				}
			);

			expect(response.status).toBe(400);
			await response.body?.cancel();
		});

		test("updates the description and variations together", async ({
			expect,
		}) => {
			const response = await mf.dispatchFetch(
				`${BASE_URL}/flagship/apps/app-1/flags/new-ui`,
				{
					method: "PATCH",
					headers: { "Content-Type": "application/json" },
					body: JSON.stringify({
						description: "Controls the redesign",
						variations: { on: true, off: false, holdout: false },
					}),
				}
			);
			const data = await expectValidResponse(
				response,
				zFlagshipUpdateFlagResponse,
				expect
			);

			expect(data.result).toMatchObject({
				description: "Controls the redesign",
				variations: { on: true, off: false, holdout: false },
				default_variation: "off",
			});

			await admin.updateFlag("new-ui", BOOLEAN_FLAG);
		});

		test("clears the description when passed null", async ({ expect }) => {
			await admin.updateFlag("new-ui", {
				...BOOLEAN_FLAG,
				description: "Temporary",
			});

			const response = await mf.dispatchFetch(
				`${BASE_URL}/flagship/apps/app-1/flags/new-ui`,
				{
					method: "PATCH",
					headers: { "Content-Type": "application/json" },
					body: JSON.stringify({ description: null }),
				}
			);
			const data = await expectValidResponse(
				response,
				zFlagshipUpdateFlagResponse,
				expect
			);

			expect(data.result?.description ?? null).toBeNull();

			await admin.updateFlag("new-ui", BOOLEAN_FLAG);
		});

		test("preserves targeting rules it does not manage", async ({ expect }) => {
			await admin.updateFlag("new-ui", {
				...BOOLEAN_FLAG,
				rules: [
					{
						priority: 1,
						conditions: [
							{ attribute: "country", operator: "in", value: ["NZ"] },
						],
						serve_variation: "on",
					},
				],
			});

			const response = await mf.dispatchFetch(
				`${BASE_URL}/flagship/apps/app-1/flags/new-ui`,
				{
					method: "PATCH",
					headers: { "Content-Type": "application/json" },
					body: JSON.stringify({ description: "Still rolling out" }),
				}
			);
			await expectValidResponse(response, zFlagshipUpdateFlagResponse, expect);

			expect(await admin.getFlag("new-ui")).toMatchObject({
				description: "Still rolling out",
				rules: [{ priority: 1, serve_variation: "on" }],
			});

			await admin.updateFlag("new-ui", BOOLEAN_FLAG);
		});

		test("rejects variations that mix types", async ({ expect }) => {
			const response = await mf.dispatchFetch(
				`${BASE_URL}/flagship/apps/app-1/flags/new-ui`,
				{
					method: "PATCH",
					headers: { "Content-Type": "application/json" },
					body: JSON.stringify({ variations: { on: true, off: "no" } }),
				}
			);

			expect(response.status).toBe(400);
			await response.body?.cancel();
			expect(await admin.getFlag("new-ui")).toMatchObject(BOOLEAN_FLAG);
		});

		test("replaces the targeting rules", async ({ expect }) => {
			const response = await mf.dispatchFetch(
				`${BASE_URL}/flagship/apps/app-1/flags/new-ui`,
				{
					method: "PATCH",
					headers: { "Content-Type": "application/json" },
					body: JSON.stringify({
						rules: [
							{
								priority: 1,
								conditions: [
									{ attribute: "plan", operator: "equals", value: "pro" },
								],
								serve_variation: "on",
							},
						],
					}),
				}
			);
			await expectValidResponse(response, zFlagshipUpdateFlagResponse, expect);

			expect(await admin.getFlag("new-ui")).toMatchObject({
				rules: [{ priority: 1, serve_variation: "on" }],
			});

			await admin.updateFlag("new-ui", BOOLEAN_FLAG);
		});

		test("rules written through the API change what the binding serves", async ({
			expect,
		}) => {
			expect(
				await patchFlag("new-ui", {
					rules: [
						{
							priority: 1,
							conditions: [
								{ attribute: "plan", operator: "in", value: ["pro", "biz"] },
							],
							serve_variation: "on",
						},
					],
				})
			).toBe(200);

			expect(await admin.evaluateFlag("new-ui", { plan: "pro" })).toMatchObject(
				{
					value: true,
					variant: "on",
					reason: "TARGETING_MATCH",
				}
			);
			expect(
				await admin.evaluateFlag("new-ui", { plan: "free" })
			).toMatchObject({ value: false, variant: "off", reason: "DEFAULT" });

			await admin.updateFlag("new-ui", BOOLEAN_FLAG);
		});

		test("stores rules in priority order so the evaluator honours priority", async ({
			expect,
		}) => {
			expect(
				await patchFlag("new-ui", {
					rules: [
						{
							priority: 2,
							conditions: [
								{ attribute: "plan", operator: "equals", value: "pro" },
							],
							serve_variation: "off",
						},
						{
							priority: 1,
							conditions: [
								{ attribute: "plan", operator: "equals", value: "pro" },
							],
							serve_variation: "on",
						},
					],
				})
			).toBe(200);

			const stored = await admin.getFlag("new-ui");
			expect(stored.rules.map((rule) => rule.priority)).toEqual([1, 2]);
			// Priority 1 serves "on", so it must win despite arriving second.
			expect(await admin.evaluateFlag("new-ui", { plan: "pro" })).toMatchObject(
				{
					variant: "on",
				}
			);

			await admin.updateFlag("new-ui", BOOLEAN_FLAG);
		});

		test("rejects a rule with a duplicate priority", async ({ expect }) => {
			const response = await mf.dispatchFetch(
				`${BASE_URL}/flagship/apps/app-1/flags/new-ui`,
				{
					method: "PATCH",
					headers: { "Content-Type": "application/json" },
					body: JSON.stringify({
						rules: [
							{ priority: 1, conditions: [], serve_variation: "on" },
							{ priority: 1, conditions: [], serve_variation: "off" },
						],
					}),
				}
			);

			expect(response.status).toBe(400);
			await response.body?.cancel();
		});

		test("rejects targeting rules ordered after a catch-all", async ({
			expect,
		}) => {
			const response = await mf.dispatchFetch(
				`${BASE_URL}/flagship/apps/app-1/flags/new-ui`,
				{
					method: "PATCH",
					headers: { "Content-Type": "application/json" },
					body: JSON.stringify({
						rules: [
							{ priority: 1, conditions: [], serve_variation: "on" },
							{
								priority: 2,
								conditions: [
									{ attribute: "plan", operator: "equals", value: "pro" },
								],
								serve_variation: "off",
							},
						],
					}),
				}
			);

			expect(response.status).toBe(400);
			await response.body?.cancel();
		});

		test("clears the rules when passed an empty array", async ({ expect }) => {
			await admin.updateFlag("new-ui", {
				...BOOLEAN_FLAG,
				rules: [
					{
						priority: 1,
						conditions: [
							{ attribute: "plan", operator: "equals", value: "pro" },
						],
						serve_variation: "on",
					},
				],
			});

			const response = await mf.dispatchFetch(
				`${BASE_URL}/flagship/apps/app-1/flags/new-ui`,
				{
					method: "PATCH",
					headers: { "Content-Type": "application/json" },
					body: JSON.stringify({ rules: [] }),
				}
			);
			await expectValidResponse(response, zFlagshipUpdateFlagResponse, expect);

			expect((await admin.getFlag("new-ui")).rules).toEqual([]);

			await admin.updateFlag("new-ui", BOOLEAN_FLAG);
		});

		test("applies a percentage rollout consistently for the same key", async ({
			expect,
		}) => {
			expect(
				await patchFlag("new-ui", {
					rules: [
						{
							priority: 1,
							conditions: [],
							serve_variation: "on",
							rollout: { percentage: 50, attribute: "userId" },
						},
					],
				})
			).toBe(200);

			const first = await admin.evaluateFlag("new-ui", { userId: "user-1" });
			const again = await admin.evaluateFlag("new-ui", { userId: "user-1" });
			expect(again.variant).toBe(first.variant);
			expect(["on", "off"]).toContain(first.variant);

			await admin.updateFlag("new-ui", BOOLEAN_FLAG);
		});

		test("rejects removing a variation a rule still serves", async ({
			expect,
		}) => {
			await admin.updateFlag("new-ui", {
				...BOOLEAN_FLAG,
				rules: [
					{
						priority: 1,
						conditions: [
							{ attribute: "country", operator: "in", value: ["NZ"] },
						],
						serve_variation: "on",
					},
				],
			});

			const response = await mf.dispatchFetch(
				`${BASE_URL}/flagship/apps/app-1/flags/new-ui`,
				{
					method: "PATCH",
					headers: { "Content-Type": "application/json" },
					body: JSON.stringify({ variations: { off: false } }),
				}
			);

			expect(response.status).toBe(400);
			await response.body?.cancel();

			await admin.updateFlag("new-ui", BOOLEAN_FLAG);
		});
	});

	describe("POST /flagship/apps/:app_id/flags/:flag_key/evaluate", () => {
		test("evaluates a targeting rule against the supplied context", async ({
			expect,
		}) => {
			await admin.putFlag({
				key: "beta",
				enabled: true,
				default_variation: "off",
				variations: { on: true, off: false },
				rules: [
					{
						priority: 1,
						conditions: [
							{ attribute: "plan", operator: "equals", value: "enterprise" },
						],
						serve_variation: "on",
					},
				],
			});

			const matched = await mf.dispatchFetch(
				`${BASE_URL}/flagship/apps/app-1/flags/beta/evaluate`,
				{
					method: "POST",
					headers: { "Content-Type": "application/json" },
					body: JSON.stringify({ context: { plan: "enterprise" } }),
				}
			);
			const matchedData = await expectValidResponse(
				matched,
				zFlagshipEvaluateFlagResponse,
				expect
			);
			expect(matchedData.result).toMatchObject({
				flagKey: "beta",
				value: true,
				variant: "on",
				reason: "TARGETING_MATCH",
			});

			const unmatched = await mf.dispatchFetch(
				`${BASE_URL}/flagship/apps/app-1/flags/beta/evaluate`,
				{
					method: "POST",
					headers: { "Content-Type": "application/json" },
					body: JSON.stringify({ context: { plan: "free" } }),
				}
			);
			const unmatchedData = await expectValidResponse(
				unmatched,
				zFlagshipEvaluateFlagResponse,
				expect
			);
			expect(unmatchedData.result).toMatchObject({
				value: false,
				reason: "DEFAULT",
			});
		});
	});

	describe("DELETE /flagship/apps/:app_id/flags/:flag_key", () => {
		test("deletes a flag", async ({ expect }) => {
			await admin.putFlag({ ...BOOLEAN_FLAG, key: "doomed" });

			const response = await mf.dispatchFetch(
				`${BASE_URL}/flagship/apps/app-1/flags/doomed`,
				{ method: "DELETE" }
			);
			const data = await expectValidResponse(
				response,
				zFlagshipDeleteFlagResponse,
				expect
			);

			expect(data.result).toEqual({ success: true });
			expect((await admin.listFlags()).map((flag) => flag.key)).not.toContain(
				"doomed"
			);
		});

		test("returns 404 for a missing flag", async ({ expect }) => {
			const response = await mf.dispatchFetch(
				`${BASE_URL}/flagship/apps/app-1/flags/absent`,
				{ method: "DELETE" }
			);

			expect(response.status).toBe(404);
			await response.body?.cancel();
		});
	});
});
