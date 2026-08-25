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

const BASE_URL = `http://localhost${CorePaths.EXPLORER}/api/flagship/apps`;
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

	function request(
		path = "",
		method = "GET",
		body?: unknown
	): Promise<Response> {
		return mf.dispatchFetch(`${BASE_URL}${path}`, {
			method,
			...(body === undefined
				? {}
				: {
						body: JSON.stringify(body),
						headers: { "Content-Type": "application/json" },
					}),
		});
	}

	async function getStatus(
		path: string,
		method: string,
		body?: unknown
	): Promise<number> {
		const response = await request(path, method, body);
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
							PROTO: { type: "flagship", id: "__proto__" },
						},
					},
				},
			],
		});
		admin = (await mf.getFlagshipBindingAPI("FLAGS"))();
		await admin.putFlag(BOOLEAN_FLAG);
	});

	afterAll(async () => disposeWithRetry(mf));

	test("lists apps and keeps app stores isolated", async ({ expect }) => {
		const apps = await expectValidResponse(
			await request(),
			zFlagshipListAppsResponse,
			expect
		);
		expect(apps.result).toEqual([
			{ id: "app-1", bindings: ["FLAGS", "ALIAS"] },
			{ id: "app-2", bindings: ["OTHER"] },
			{ id: "__proto__", bindings: ["PROTO"] },
		]);

		const flags = await expectValidResponse(
			await request("/app-1/flags"),
			zFlagshipListFlagsResponse,
			expect
		);
		expect(flags.result).toMatchObject([
			{ key: "new-ui", type: "boolean", enabled: true },
		]);
		const other = await expectValidResponse(
			await request("/app-2/flags"),
			zFlagshipListFlagsResponse,
			expect
		);
		expect(other.result).toEqual([]);
		const proto = await expectValidResponse(
			await request("/__proto__/flags"),
			zFlagshipListFlagsResponse,
			expect
		);
		expect(proto.result).toEqual([]);
	});

	test("supports full CRUD and evaluates changes through the binding", async ({
		expect,
	}) => {
		const body = {
			key: "managed",
			description: "created locally",
			enabled: true,
			default_variation: "off",
			variations: { on: "yes", off: "no" },
			rules: [
				{
					priority: 1,
					conditions: [{ attribute: "plan", operator: "equals", value: "pro" }],
					serve_variation: "on",
				},
			],
		};
		const created = await expectValidResponse(
			await request("/app-1/flags", "POST", body),
			zFlagshipCreateFlagResponse,
			expect
		);
		expect(created.result).toMatchObject({ key: "managed", type: "string" });
		expect(await admin.evaluateFlag("managed", { plan: "pro" })).toMatchObject({
			value: "yes",
			reason: "TARGETING_MATCH",
		});

		const fetched = await expectValidResponse(
			await request("/app-1/flags/managed"),
			zFlagshipGetFlagResponse,
			expect
		);
		expect(fetched.result).toMatchObject(body);

		const updated = await expectValidResponse(
			await request("/app-1/flags/managed", "PATCH", {
				description: null,
				default_variation: "on",
				rules: [
					{
						priority: 1,
						conditions: [],
						serve_variation: "off",
						rollout: { percentage: 33.5, attribute: "userId" },
					},
				],
			}),
			zFlagshipUpdateFlagResponse,
			expect
		);
		expect(updated.result).toMatchObject({
			default_variation: "on",
			rules: [{ rollout: { percentage: 33.5, attribute: "userId" } }],
		});
		expect(updated.result?.description ?? null).toBeNull();

		const evaluation = await expectValidResponse(
			await request("/app-1/flags/managed/evaluate", "POST", {
				context: { userId: "same-user" },
			}),
			zFlagshipEvaluateFlagResponse,
			expect
		);
		expect(evaluation.result?.flagKey).toBe("managed");

		const deleted = await expectValidResponse(
			await request("/app-1/flags/managed", "DELETE"),
			zFlagshipDeleteFlagResponse,
			expect
		);
		expect(deleted.result).toEqual({ success: true });
		expect((await admin.listFlags()).map(({ key }) => key)).not.toContain(
			"managed"
		);
	});

	test("PATCH leaves omitted fields and rules untouched", async ({
		expect,
	}) => {
		await admin.updateFlag("new-ui", {
			...BOOLEAN_FLAG,
			description: "another writer",
			rules: [
				{
					priority: 1,
					conditions: [{ attribute: "country", operator: "in", value: ["NZ"] }],
					serve_variation: "on",
				},
			],
		});
		await expectValidResponse(
			await request("/app-1/flags/new-ui", "PATCH", { enabled: false }),
			zFlagshipUpdateFlagResponse,
			expect
		);
		expect(await admin.getFlag("new-ui")).toMatchObject({
			description: "another writer",
			enabled: false,
			rules: [{ serve_variation: "on" }],
		});
		await admin.updateFlag("new-ui", BOOLEAN_FLAG);
	});

	test("stores rules by priority and applies stable percentage rollout", async ({
		expect,
	}) => {
		const response = await request("/app-1/flags/new-ui", "PATCH", {
			rules: [
				{
					priority: 2,
					conditions: [],
					serve_variation: "off",
					rollout: { percentage: 100 },
				},
				{
					priority: 1,
					conditions: [],
					serve_variation: "on",
					rollout: { percentage: 50, attribute: "userId" },
				},
			],
		});
		await response.body?.cancel();
		expect(response.status).toBe(200);
		expect(
			(await admin.getFlag("new-ui")).rules.map(({ priority }) => priority)
		).toEqual([1, 2]);
		const first = await admin.evaluateFlag("new-ui", { userId: "user-1" });
		expect(await admin.evaluateFlag("new-ui", { userId: "user-1" })).toEqual(
			first
		);
		await admin.updateFlag("new-ui", BOOLEAN_FLAG);
	});

	test("defaults optional create fields", async ({ expect }) => {
		await expectValidResponse(
			await request("/app-1/flags", "POST", {
				key: "quiet",
				default_variation: "off",
				variations: { on: true, off: false },
			}),
			zFlagshipCreateFlagResponse,
			expect
		);
		expect(await admin.getFlag("quiet")).toMatchObject({
			enabled: false,
			rules: [],
		});
		await admin.deleteFlag("quiet");
	});

	test("returns API errors for invalid flags and missing resources", async ({
		expect,
	}) => {
		const duplicate = await request("/app-1/flags", "POST", BOOLEAN_FLAG);
		expect(duplicate.status).toBe(400);
		expect(await duplicate.json()).toMatchObject({
			success: false,
			errors: [{ message: "Flag 'new-ui' already exists" }],
		});

		expect(
			await getStatus("/app-1/flags", "POST", {
				key: "malformed",
				default_variation: "off",
				variations: { on: true, off: false },
				rules: [
					{
						priority: 1,
						conditions: [{ logical_operator: "XOR", clauses: [] }],
						serve_variation: "on",
					},
				],
			})
		).toBe(400);
		expect(await getStatus("/missing/flags", "GET")).toBe(404);
		expect(await getStatus("/app-1/flags/missing", "GET")).toBe(404);
		expect(await getStatus("/app-1/flags/missing", "DELETE")).toBe(404);
	});

	test("rejects invalid creates without writing them", async ({ expect }) => {
		const cases = [
			{
				key: "bad-default",
				default_variation: "missing",
				variations: { on: true, off: false },
			},
			{
				key: "mixed-types",
				default_variation: "on",
				variations: { on: true, off: "false" },
			},
		];
		for (const flag of cases) {
			const response = await request("/app-1/flags", "POST", flag);
			expect(response.status).toBe(400);
			expect(await response.json()).toMatchObject({ success: false });
			await expect(
				Promise.resolve().then(() => admin.getFlag(flag.key))
			).rejects.toThrow();
		}
	});
});
