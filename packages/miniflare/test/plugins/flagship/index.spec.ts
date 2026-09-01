import { Miniflare, WorkerOptionsSchema } from "miniflare";
import { describe, test } from "vitest";
import { singleModuleManifest, useDispose, useTmp } from "../../test-shared";
import type { FlagInput, MiniflareOptions } from "miniflare";

function workerConfigBase(
	overrides?: Record<string, unknown>
): Record<string, unknown> {
	return {
		type: "worker",
		name: "test-worker",
		compatibilityDate: "2025-01-01",
		manifest: {
			mainModule: "index.js",
			modules: {
				"index.js": { type: "esm", contents: "export default {}" },
			},
		},
		...overrides,
	};
}

const WORKER_SCRIPT = `
	export default {
		async fetch(request, env) {
			const { method, args } = await request.json();
			return Response.json({ result: await env.FLAGS[method](...args) });
		},
	};
`;

function options(
	env: Record<string, { type: "flagship"; id?: string }> = {
		FLAGS: { type: "flagship", id: "app" },
	}
): MiniflareOptions {
	return {
		workers: [
			{
				config: {
					type: "worker",
					name: "",
					compatibilityDate: "2025-05-01",
					env,
					manifest: singleModuleManifest(WORKER_SCRIPT),
				},
			},
		],
	};
}

const BOOL_FLAG: FlagInput = {
	key: "new_checkout",
	enabled: true,
	default_variation: "off",
	variations: { on: true, off: false },
	rules: [
		{
			priority: 1,
			conditions: [{ attribute: "plan", operator: "equals", value: "pro" }],
			serve_variation: "on",
		},
	],
};

test("flagship: accepts valid flagship binding", ({ expect }) => {
	const result = WorkerOptionsSchema.safeParse({
		config: workerConfigBase({
			env: {
				FLAGS: {
					type: "flagship",
					id: "xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx",
				},
			},
		}),
	});
	expect(result.success).toBe(true);
});

test("flagship: accepts flagship binding with remote", ({ expect }) => {
	const result = WorkerOptionsSchema.safeParse({
		config: workerConfigBase({
			env: {
				FLAGS: {
					type: "flagship",
					id: "xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx",
					dev: { remote: true },
				},
			},
		}),
	});
	expect(result.success).toBe(true);
});

test("flagship: accepts config with no flagship binding", ({ expect }) => {
	const result = WorkerOptionsSchema.safeParse({
		config: workerConfigBase(),
	});
	expect(result.success).toBe(true);
});

const ACCOUNT_TAG = "aaaabbbbccccdddd1111222233334444";
const BUCKETS = { "0": 15, "1": 8, "2": 91, "": 50, 日本語: 9, héllo: 73 };
const ROLLOUT_FLAG: FlagInput = {
	...BOOL_FLAG,
	key: "rollout_test",
	rules: [
		{
			priority: 1,
			conditions: [],
			serve_variation: "on",
			rollout: { percentage: 50 },
		},
	],
};

async function getAdmin(mf: Miniflare, binding = "FLAGS") {
	return (await mf.getFlagshipBindingAPI(binding))();
}

async function call(mf: Miniflare, method: string, ...args: unknown[]) {
	const response = await mf.dispatchFetch("http://placeholder", {
		method: "POST",
		body: JSON.stringify({ method, args }),
	});
	if (!response.ok) throw new Error(await response.text());
	return ((await response.json()) as { result: unknown }).result;
}

async function rejection(call: () => Promise<unknown>): Promise<string> {
	try {
		await call();
	} catch (error) {
		return (error as Error).message;
	}
	throw new Error("expected rejection");
}

describe("flagship plugin", () => {
	test("keeps app service names separate from internal services", async ({
		expect,
	}) => {
		const mf = new Miniflare(
			options({
				OBJECT: { type: "flagship", id: "internal:object" },
				REMOTE: { type: "flagship", id: "internal:remote" },
				STORAGE: { type: "flagship", id: "internal:storage" },
			})
		);
		useDispose(mf);

		await expect(getAdmin(mf, "OBJECT")).resolves.toBeDefined();
		await expect(getAdmin(mf, "REMOTE")).resolves.toBeDefined();
		await expect(getAdmin(mf, "STORAGE")).resolves.toBeDefined();
	});

	test("implements binding values, details, defaults, and errors", async ({
		expect,
	}) => {
		const mf = new Miniflare(options());
		useDispose(mf);
		const admin = await getAdmin(mf);
		await admin.createFlag(BOOL_FLAG);

		expect(
			await call(mf, "getBooleanValue", BOOL_FLAG.key, false, { plan: "pro" })
		).toBe(true);
		expect(
			await call(mf, "getBooleanDetails", BOOL_FLAG.key, false, { plan: "pro" })
		).toEqual({
			flagKey: BOOL_FLAG.key,
			value: true,
			variant: "on",
			reason: "TARGETING_MATCH",
		});
		expect(await call(mf, "getStringValue", "missing", "fallback")).toBe(
			"fallback"
		);
		expect(await call(mf, "getStringDetails", "missing", "fallback")).toEqual({
			flagKey: "missing",
			value: "fallback",
			variant: "default",
			reason: "ERROR",
			errorCode: "FLAG_NOT_FOUND",
			errorMessage: "Flag 'missing' not found",
		});
		expect(
			await call(mf, "getStringDetails", BOOL_FLAG.key, "fallback")
		).toEqual(
			expect.objectContaining({
				value: "fallback",
				errorCode: "TYPE_MISMATCH",
				errorMessage:
					"Flag 'new_checkout' has type 'boolean', expected 'string'",
			})
		);
		await expect(call(mf, "get", "missing")).rejects.toThrow(
			"Flag 'missing' not found"
		);
		expect(await call(mf, "get", "missing", false)).toBe(false);
	});

	test("supports every admin mutation", async ({ expect }) => {
		const mf = new Miniflare(options());
		useDispose(mf);
		const admin = await getAdmin(mf);

		expect(await admin.listFlags()).toEqual([]);
		const created = await admin.createFlag(BOOL_FLAG);
		expect(await admin.getFlag(BOOL_FLAG.key)).toEqual(created);
		await admin.updateFlag(BOOL_FLAG.key, { ...BOOL_FLAG, enabled: false });
		expect(
			await admin.evaluateFlag(BOOL_FLAG.key, { plan: "pro" })
		).toMatchObject({
			value: false,
			reason: "DISABLED",
		});
		await admin.patchFlag(BOOL_FLAG.key, { description: "description" });
		expect(await admin.getFlag(BOOL_FLAG.key)).toMatchObject({
			description: "description",
			enabled: false,
		});
		await admin.putFlag({ ...BOOL_FLAG, enabled: true });
		await admin.putFlag({ ...BOOL_FLAG, enabled: false });
		expect(await admin.listFlags()).toHaveLength(1);
		await admin.putFlags([{ ...BOOL_FLAG, enabled: true }], ACCOUNT_TAG);
		expect(await admin.getAccountTag()).toBe(ACCOUNT_TAG);
		await admin.deleteFlag(BOOL_FLAG.key);
		expect(await admin.listFlags()).toEqual([]);
	});

	test("reports missing and conflicting admin operations", async ({
		expect,
	}) => {
		const mf = new Miniflare(options());
		useDispose(mf);
		const admin = await getAdmin(mf);
		await admin.createFlag(BOOL_FLAG);
		expect(await rejection(() => admin.createFlag(BOOL_FLAG))).toBe(
			"Flag 'new_checkout' already exists"
		);
		for (const operation of [
			() => admin.getFlag("missing"),
			() => admin.updateFlag("missing", BOOL_FLAG),
			() => admin.patchFlag("missing", {}),
			() => admin.deleteFlag("missing"),
		]) {
			expect(await rejection(operation)).toBe("Flag 'missing' not found");
		}
	});

	test("enforces flag validation", async ({ expect }) => {
		const mf = new Miniflare(options());
		useDispose(mf);
		const admin = await getAdmin(mf);
		const cases: [Partial<FlagInput>, string][] = [
			[
				{ key: "not valid!" },
				"Flag key 'not valid!' must be 1-64 alphanumeric, hyphen or underscore characters",
			],
			[{ variations: {} }, "must define at least one variation"],
			[{ variations: { on: true, off: "no" } }, "must all share the same type"],
			[{ variations: { on: null, off: null } }, "variations cannot be null"],
			[
				{ variations: { on: Number.POSITIVE_INFINITY, off: 0 } },
				"variations must contain values that can be stored as JSON",
			],
			[
				{ variations: { on: new Date(), off: {} } },
				"variations must contain values that can be stored as JSON",
			],
			[
				{ default_variation: "missing" },
				"default variation 'missing' is not defined",
			],
			[
				{ rules: [{ ...BOOL_FLAG.rules[0], serve_variation: "missing" }] },
				"rule serves undefined variation 'missing'",
			],
			[
				{ rules: [{ ...BOOL_FLAG.rules[0], priority: 0 }] },
				"rule priorities must be integers greater than or equal to 1",
			],
			[
				{ rules: [BOOL_FLAG.rules[0], { ...BOOL_FLAG.rules[0] }] },
				"duplicate rule priority 1",
			],
			[
				{
					rules: [
						{ priority: 1, conditions: [], serve_variation: "on" },
						{ ...BOOL_FLAG.rules[0], priority: 2 },
					],
				},
				"targeting rules after a rule with no conditions",
			],
			[
				{ rules: [{ ...BOOL_FLAG.rules[0], rollout: { percentage: 101 } }] },
				"rollout percentage must be a number between 0 and 100",
			],
			[
				{
					rules: [
						{
							...BOOL_FLAG.rules[0],
							conditions: [{ logical_operator: "AND" } as never],
						},
					],
				},
				"'AND' condition without a list of clauses",
			],
			[
				{
					rules: [
						{
							...BOOL_FLAG.rules[0],
							conditions: [
								{ attribute: "plan", operator: "invalid", value: "pro" },
							] as never,
						},
					],
				},
				"condition with an unknown operator 'invalid'",
			],
			[
				{
					rules: [
						{
							...BOOL_FLAG.rules[0],
							conditions: [
								{ attribute: "plan", operator: "in", value: "pro" },
							] as never,
						},
					],
				},
				"'in' condition whose value is not a list",
			],
		];
		for (const [changes, message] of cases) {
			expect(
				await rejection(() =>
					admin.putFlag({ ...BOOL_FLAG, ...changes } as FlagInput)
				)
			).toContain(message);
		}
		const fractional = await admin.putFlag({
			...BOOL_FLAG,
			rules: [{ ...BOOL_FLAG.rules[0], rollout: { percentage: 33.333333 } }],
		});
		expect(fractional.rules[0].rollout?.percentage).toBe(33.333333);
		const partialRollout = await admin.putFlag({
			...BOOL_FLAG,
			rules: [
				{
					priority: 1,
					conditions: [],
					serve_variation: "on",
					rollout: { percentage: 50 },
				},
				{ ...BOOL_FLAG.rules[0], priority: 2 },
			],
		});
		expect(partialRollout.rules).toHaveLength(2);
	});

	test("rejects malformed JavaScript inputs without persisting them", async ({
		expect,
	}) => {
		const mf = new Miniflare(options());
		useDispose(mf);
		const admin = await getAdmin(mf);
		const malformedInputs: [unknown, string][] = [
			[null, "Flag input must be an object"],
			[{ ...BOOL_FLAG, key: 123 }, "Flag key must be a string"],
			[
				{ ...BOOL_FLAG, description: { text: "description" } },
				"description must be a string or null",
			],
			[{ ...BOOL_FLAG, enabled: "true" }, "enabled must be a boolean"],
			[{ ...BOOL_FLAG, variations: [] }, "variations must be an object"],
			[
				{ ...BOOL_FLAG, default_variation: 1 },
				"default variation must be a string",
			],
			[{ ...BOOL_FLAG, rules: [null] }, "rules must contain objects"],
			[
				{
					...BOOL_FLAG,
					rules: [{ ...BOOL_FLAG.rules[0], priority: "1" }],
				},
				"rule priorities must be integers greater than or equal to 1",
			],
			[
				{
					...BOOL_FLAG,
					rules: [{ ...BOOL_FLAG.rules[0], rollout: null }],
				},
				"rollout must be an object",
			],
			[
				{
					...BOOL_FLAG,
					rules: [{ ...BOOL_FLAG.rules[0], rollout: { percentage: "50" } }],
				},
				"rollout percentage must be a number between 0 and 100",
			],
		];

		for (const [input, message] of malformedInputs) {
			expect(
				await rejection(() => admin.putFlag(input as FlagInput))
			).toContain(message);
			expect(await admin.listFlags()).toEqual([]);
		}
	});

	test("validates account tags and makes batch writes atomic", async ({
		expect,
	}) => {
		const mf = new Miniflare(options());
		useDispose(mf);
		const admin = await getAdmin(mf);
		for (const operation of [
			() => admin.setAccountTag(""),
			() => admin.putFlags([BOOL_FLAG], ""),
		]) {
			expect(await rejection(operation)).toBe(
				"accountTag must be a non-empty string"
			);
		}
		expect(
			await rejection(() =>
				admin.putFlags(
					[BOOL_FLAG, { ...BOOL_FLAG, key: "invalid", variations: {} }],
					ACCOUNT_TAG
				)
			)
		).toBe("Flag 'invalid' must define at least one variation");
		expect(await admin.listFlags()).toEqual([]);
		expect(await admin.getAccountTag()).toBeNull();
	});

	test("isolates apps and shares aliases", async ({ expect }) => {
		const mf = new Miniflare(
			options({
				FLAGS: { type: "flagship", id: "app-a" },
				ALIAS: { type: "flagship", id: "app-a" },
				OTHER: { type: "flagship", id: "app-b" },
			})
		);
		useDispose(mf);
		const admin = await getAdmin(mf);
		await admin.createFlag(BOOL_FLAG);
		await admin.setAccountTag(ACCOUNT_TAG);
		expect(await (await getAdmin(mf, "ALIAS")).listFlags()).toHaveLength(1);
		expect(await (await getAdmin(mf, "OTHER")).listFlags()).toEqual([]);
		expect(await (await getAdmin(mf, "OTHER")).getAccountTag()).toBeNull();
	});

	test("persists flags and account tags", async ({ expect }) => {
		const persistence = await useTmp();
		const opts = { ...options(), resourcePersistencePath: persistence };
		const first = new Miniflare(opts);
		const admin = await getAdmin(first);
		await admin.createFlag(BOOL_FLAG);
		await admin.setAccountTag(ACCOUNT_TAG);
		await first.dispose();

		const second = new Miniflare(opts);
		useDispose(second);
		expect(await (await getAdmin(second)).getAccountTag()).toBe(ACCOUNT_TAG);
		expect(
			await call(second, "getBooleanValue", BOOL_FLAG.key, false, {
				plan: "pro",
			})
		).toBe(true);
	});

	test("shares live persistent storage across instances", async ({
		expect,
	}) => {
		const persistence = await useTmp();
		const opts = { ...options(), resourcePersistencePath: persistence };
		const first = new Miniflare(opts);
		useDispose(first);
		const firstAdmin = await getAdmin(first);
		expect(await firstAdmin.listFlags()).toEqual([]);
		const second = new Miniflare(opts);
		useDispose(second);
		await (await getAdmin(second)).createFlag(BOOL_FLAG);
		expect(await firstAdmin.listFlags()).toEqual([
			expect.objectContaining({ key: BOOL_FLAG.key }),
		]);
	});

	test("reproduces seeded rollout buckets", async ({ expect }) => {
		const warnings: string[] = [];
		const mf = new Miniflare({
			...options(),
			handleStructuredLogs(log) {
				if (log.level === "warn") warnings.push(log.message);
			},
		});
		useDispose(mf);
		const admin = await getAdmin(mf);
		await admin.setAccountTag(ACCOUNT_TAG);
		await admin.createFlag(ROLLOUT_FLAG);
		for (const [targetingKey, bucket] of Object.entries(BUCKETS)) {
			expect(
				await call(mf, "getBooleanValue", ROLLOUT_FLAG.key, false, {
					targetingKey,
				})
			).toBe(bucket < 50);
		}
		expect(warnings).toEqual([]);
	});

	test("warns once for unseeded partial rollouts only", async ({ expect }) => {
		const warnings: string[] = [];
		const mf = new Miniflare({
			...options(),
			handleStructuredLogs(log) {
				if (log.level === "warn") warnings.push(log.message);
			},
		});
		useDispose(mf);
		const admin = await getAdmin(mf);
		await admin.createFlag(BOOL_FLAG);
		await call(mf, "getBooleanValue", BOOL_FLAG.key, false, { plan: "pro" });
		await admin.createFlag({
			...ROLLOUT_FLAG,
			key: "full_rollout",
			rules: [{ ...ROLLOUT_FLAG.rules[0], rollout: { percentage: 100 } }],
		});
		await call(mf, "getBooleanValue", "full_rollout", false, {
			targetingKey: "0",
		});
		expect(warnings).toEqual([]);
		await admin.createFlag(ROLLOUT_FLAG);
		for (const targetingKey of ["0", "1"]) {
			await call(mf, "getBooleanValue", ROLLOUT_FLAG.key, false, {
				targetingKey,
			});
		}
		expect(warnings).toEqual([
			"Flagship: flag 'rollout_test' has a percentage rollout, but the local flag store has no account tag, so its buckets will not match your remote app. Run `wrangler flagship flags pull` to seed the store.",
		]);
	});
});
