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
