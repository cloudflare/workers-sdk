import { Miniflare } from "miniflare";
import { afterAll, beforeAll, describe, test } from "vitest";
import { CorePaths } from "../../../src/workers/core/constants";
import {
	zFlagshipCreateFlagResponse,
	zFlagshipDeleteFlagResponse,
	zFlagshipEvaluateFlagResponse,
	zFlagshipEvaluateFlagPostResponse,
	zFlagshipGetFlagResponse,
	zFlagshipListAppsResponse,
	zFlagshipListFlagsResponse,
	zFlagshipPatchFlagResponse,
	zFlagshipUpdateFlagResponse,
} from "../../../src/workers/local-explorer/generated/zod.gen";
import {
	dispatchFetchWithRetry,
	disposeWithRetry,
	singleModuleManifest,
} from "../../test-shared";
import {
	createSharedStorageExplorerPair,
	createUnboundStorageExplorer,
	expectValidResponse,
} from "./helpers";
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
			expect,
			201
		);
		expect(created.result).toMatchObject({ key: "managed", type: "string" });
		expect(await admin.evaluateFlag("managed", { plan: "pro" })).toMatchObject({
			value: "yes",
			reason: "TARGETING_MATCH",
		});

		const replaced = await expectValidResponse(
			await request("/app-1/flags/managed", "PUT", {
				...body,
				description: null,
				default_variation: "on",
				rules: [
					{
						priority: 1,
						conditions: [
							{ attribute: "roles", operator: "has", value: "admin" },
						],
						serve_variation: "off",
						rollout: { percentage: 33.5, attribute: "userId" },
					},
				],
			}),
			zFlagshipUpdateFlagResponse,
			expect
		);
		expect(replaced.result).toMatchObject({
			default_variation: "on",
			rules: [{ rollout: { percentage: 33.5, attribute: "userId" } }],
		});
		expect(replaced.result?.description ?? null).toBeNull();

		const patched = await expectValidResponse(
			await request("/app-1/flags/managed", "PATCH", { enabled: false }),
			zFlagshipPatchFlagResponse,
			expect
		);
		expect(patched.result).toMatchObject({
			enabled: false,
			default_variation: "on",
			rules: [{ rollout: { percentage: 33.5, attribute: "userId" } }],
		});

		const evaluation = await expectValidResponse(
			await request("/app-1/evaluate", "POST", {
				flagKey: "managed",
				context: { userId: "same-user" },
			}),
			zFlagshipEvaluateFlagPostResponse,
			expect
		);
		expect(evaluation.flagKey).toBe("managed");

		const deleted = await expectValidResponse(
			await request("/app-1/flags/managed", "DELETE"),
			zFlagshipDeleteFlagResponse,
			expect
		);
		expect(deleted.result).toEqual({ key: "managed" });
		expect((await admin.listFlags()).map(({ key }) => key)).not.toContain(
			"managed"
		);
	});

	test("returns API errors for invalid flags and missing resources", async ({
		expect,
	}) => {
		const duplicate = await request("/app-1/flags", "POST", BOOLEAN_FLAG);
		expect(duplicate.status).toBe(409);
		expect(await duplicate.json()).toMatchObject({
			success: false,
			errors: [{ message: "Flag 'new-ui' already exists" }],
		});

		expect(
			await getStatus("/app-1/flags", "POST", {
				key: "malformed",
				enabled: true,
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
		expect(await getStatus("/app-1/flags/missing", "GET")).toBe(404);
		expect(
			await getStatus("/app-1/flags/missing", "PUT", {
				...BOOLEAN_FLAG,
				key: "missing",
			})
		).toBe(404);
		expect(
			await getStatus("/app-1/flags/new-ui", "PUT", {
				key: "new-ui",
				default_variation: "off",
				variations: { on: true, off: false },
			})
		).toBe(400);
		expect(await getStatus("/app-1/flags/missing", "DELETE")).toBe(404);
		expect(
			await getStatus("/app-1/flags/missing", "PATCH", { enabled: false })
		).toBe(404);
		expect(
			await getStatus("/app-1/flags/new-ui", "PATCH", {
				default_variation: "missing",
			})
		).toBe(400);
	});

	test("follows the API's metadata semantics", async ({ expect }) => {
		const metadata = { owner: "growth", ticket: 42 };
		const flag = { ...BOOLEAN_FLAG, key: "with-metadata", rules: [] };
		const read = async (response: Response) =>
			((await response.json()) as { result: Record<string, unknown> }).result;

		expect(
			await read(await request("/app-1/flags", "POST", { ...flag, metadata }))
		).toMatchObject({ metadata });
		expect(
			await read(
				await request("/app-1/flags/with-metadata", "PATCH", { enabled: false })
			)
		).toMatchObject({ metadata });
		const evaluation = await request("/app-1/evaluate", "POST", {
			flagKey: "with-metadata",
		});
		expect(await evaluation.json()).toMatchObject({ metadata });
		expect(
			await read(
				await request("/app-1/flags/with-metadata", "PATCH", { metadata: null })
			)
		).not.toHaveProperty("metadata");
		await admin.patchFlag("with-metadata", { metadata });
		expect(
			await read(await request("/app-1/flags/with-metadata", "PUT", flag))
		).not.toHaveProperty("metadata");
		expect(
			await getStatus("/app-1/flags/with-metadata", "PATCH", {
				metadata: { owner: "x".repeat(2048) },
			})
		).toBe(400);
		expect(
			await getStatus("/app-1/flags/with-metadata", "PATCH", {
				metadata: { constructor: 1 },
			})
		).toBe(400);

		await admin.deleteFlag("with-metadata");
	});

	test("paginates flags by key", async ({ expect }) => {
		for (const key of ["page-c", "page-a", "page-b"]) {
			expect(
				await getStatus("/paged/flags", "POST", { ...BOOLEAN_FLAG, key })
			).toBe(201);
		}
		const list = async (query: string) =>
			expectValidResponse(
				await request(`/paged/flags?${query}`),
				zFlagshipListFlagsResponse,
				expect
			);

		const first = await list("limit=2");
		expect(first.result?.map(({ key }) => key)).toEqual(["page-a", "page-b"]);
		expect(first.result_info).toEqual({ count: 2, cursor: "page-b" });
		const second = await list("limit=2&cursor=page-b");
		expect(second.result?.map(({ key }) => key)).toEqual(["page-c"]);
		expect(second.result_info).toEqual({ count: 1, cursor: null });
		expect(await getStatus("/paged/flags?limit=201", "GET")).toBe(400);
		expect(await getStatus("/paged/flags?limit=0", "GET")).toBe(400);
	});

	test("gets and replaces a flag", async ({ expect }) => {
		await admin.createFlag({
			...BOOLEAN_FLAG,
			key: "replaceable",
			description: "before",
		});

		const fetched = await expectValidResponse(
			await request("/app-1/flags/replaceable"),
			zFlagshipGetFlagResponse,
			expect
		);
		expect(fetched.result).toMatchObject({
			key: "replaceable",
			description: "before",
		});

		const replaced = await expectValidResponse(
			await request("/app-1/flags/replaceable", "PUT", {
				key: "ignored",
				type: "boolean",
				enabled: true,
				default_variation: "on",
				variations: { on: 1, off: 2 },
				rules: [],
			}),
			zFlagshipUpdateFlagResponse,
			expect
		);
		expect(replaced.result).toMatchObject({
			key: "replaceable",
			default_variation: "on",
			variations: { on: 1, off: 2 },
			rules: [],
			type: "number",
		});
		expect(replaced.result?.description ?? null).toBeNull();
		expect((await admin.listFlags()).map(({ key }) => key)).not.toContain(
			"ignored"
		);
	});

	test("evaluates a flag from the request body or the query string", async ({
		expect,
	}) => {
		await admin.createFlag({
			...BOOLEAN_FLAG,
			key: "gated",
			rules: [
				{
					priority: 1,
					conditions: [{ attribute: "plan", operator: "equals", value: "pro" }],
					serve_variation: "on",
				},
			],
		});

		const matched = await expectValidResponse(
			await request("/app-1/evaluate", "POST", {
				flagKey: "gated",
				context: { plan: "pro" },
			}),
			zFlagshipEvaluateFlagPostResponse,
			expect
		);
		expect(matched).toEqual({
			flagKey: "gated",
			value: true,
			variant: "on",
			reason: "TARGETING_MATCH",
		});
		expect(
			await expectValidResponse(
				await request("/app-1/evaluate?flagKey=gated&plan=pro&plan=free"),
				zFlagshipEvaluateFlagResponse,
				expect
			)
		).toMatchObject({ variant: "on", reason: "TARGETING_MATCH" });
		expect(
			await expectValidResponse(
				await request("/app-1/evaluate?flagKey=gated&plan=free"),
				zFlagshipEvaluateFlagResponse,
				expect
			)
		).toMatchObject({ variant: "off", reason: "DEFAULT" });
	});

	test("uses the query string as the evaluation context", async ({
		expect,
	}) => {
		await admin.createFlag({
			...BOOLEAN_FLAG,
			key: "typed",
			rules: [
				{
					priority: 1,
					conditions: [
						{ attribute: "beta", operator: "equals", value: true },
						{ attribute: "seats", operator: "greater_than", value: 10 },
						{ attribute: "worker", operator: "equals", value: "checkout" },
					],
					serve_variation: "on",
				},
			],
		});
		const variant = async (query: string) => {
			const response = await request(`/app-1/evaluate?flagKey=typed&${query}`);
			return ((await response.json()) as { variant: string }).variant;
		};

		expect(await variant("beta=true&seats=11&worker=checkout")).toBe("on");
		expect(await variant("beta=TRUE&seats=11&worker=checkout")).toBe("off");
		expect(await variant("beta=true&seats=9&worker=checkout")).toBe("off");
		expect(await variant("beta=true&seats=11&worker=other")).toBe("off");
		expect(
			await variant("flagKey=other&beta=true&seats=11&worker=checkout")
		).toBe("on");
	});

	test("returns OpenFeature error codes for failed evaluations", async ({
		expect,
	}) => {
		const errorCode = async (path: string, body?: unknown) => {
			const response = await request(
				`/app-1/evaluate${path}`,
				body === undefined ? "GET" : "POST",
				body
			);
			const json = (await response.json()) as { errorCode: string };
			return [response.status, json.errorCode];
		};

		expect(await errorCode("")).toEqual([400, "GENERAL"]);
		expect(await errorCode("?flagKey=missing")).toEqual([
			404,
			"FLAG_NOT_FOUND",
		]);
		expect(await errorCode("", { flagKey: "missing" })).toEqual([
			404,
			"FLAG_NOT_FOUND",
		]);
	});

	test("rejects invalid evaluate request bodies", async ({ expect }) => {
		expect(await getStatus("/app-1/evaluate", "POST", { context: {} })).toBe(
			400
		);
		expect(
			await getStatus("/app-1/evaluate", "POST", {
				flagKey: "new-ui",
				context: "invalid",
			})
		).toBe(400);
	});
});

test("addresses arbitrary app IDs without a Flagship binding", async ({
	expect,
}) => {
	const mf = createUnboundStorageExplorer();

	try {
		await mf.ready;
		const url = `${BASE_URL}/unbound-app`;
		const send = (path: string, method: string, body?: unknown) =>
			dispatchFetchWithRetry(mf, `${url}${path}`, {
				method,
				...(body === undefined
					? {}
					: {
							body: JSON.stringify(body),
							headers: { "Content-Type": "application/json" },
						}),
			});

		expect(
			await expectValidResponse(
				await send("/flags", "GET"),
				zFlagshipListFlagsResponse,
				expect
			)
		).toMatchObject({ result: [] });
		const created = await send("/flags", "POST", BOOLEAN_FLAG);
		expect(created.status).toBe(201);
		await created.body?.cancel();
		expect(
			await expectValidResponse(
				await send("/flags/new-ui", "GET"),
				zFlagshipGetFlagResponse,
				expect
			)
		).toMatchObject({ result: { key: "new-ui" } });
		expect(
			await expectValidResponse(
				await send("/evaluate", "POST", { flagKey: "new-ui" }),
				zFlagshipEvaluateFlagPostResponse,
				expect
			)
		).toMatchObject({ variant: "off", reason: "STATIC" });

		// Apps are listed only while a Worker binds them.
		const apps = await dispatchFetchWithRetry(mf, BASE_URL);
		expect(await apps.json()).toMatchObject({ result: [] });
	} finally {
		await disposeWithRetry(mf);
	}
});

test("routes arbitrary app IDs through the shared-storage owner", async ({
	expect,
}) => {
	const { owner, client } = await createSharedStorageExplorerPair();

	try {
		await client.ready;
		const flagsUrl = `${BASE_URL}/shared-app/flags`;
		const created = await dispatchFetchWithRetry(client, flagsUrl, {
			method: "POST",
			body: JSON.stringify(BOOLEAN_FLAG),
			headers: { "Content-Type": "application/json" },
		});
		expect(created.status).toBe(201);
		await created.body?.cancel();

		const listed = await expectValidResponse(
			await dispatchFetchWithRetry(owner, flagsUrl),
			zFlagshipListFlagsResponse,
			expect
		);
		expect(listed.result).toMatchObject([{ key: "new-ui" }]);
	} finally {
		await Promise.all([disposeWithRetry(client), disposeWithRetry(owner)]);
	}
});
