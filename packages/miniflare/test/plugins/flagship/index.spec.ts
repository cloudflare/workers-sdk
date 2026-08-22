import { Miniflare } from "miniflare";
import { describe, test } from "vitest";
import { singleModuleManifest, useDispose, useTmp } from "../../test-shared";
import type { FlagInput, MiniflareOptions } from "miniflare";

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

// Account tag and bucket expectations copied from the upstream Flagship
// data-plane suite, so seeding the local store must reproduce them exactly.
const UPSTREAM_ACCOUNT_TAG = "aaaabbbbccccdddd1111222233334444";
const UPSTREAM_BUCKETS: Record<string, number> = {
	"0": 15,
	"1": 8,
	"2": 91,
	"": 50,
	日本語: 9,
	héllo: 73,
	false: 33,
};

const ROLLOUT_PERCENTAGE = 50;

const ROLLOUT_FLAG: FlagInput = {
	key: "rollout_test",
	enabled: true,
	default_variation: "off",
	variations: { on: true, off: false },
	rules: [
		{
			priority: 1,
			conditions: [],
			serve_variation: "on",
			rollout: { percentage: ROLLOUT_PERCENTAGE },
		},
	],
};

/**
 * Await an admin API call and return the message it rejects with. Handing the
 * RPC promise to Vitest's `.rejects` matcher instead leaves it unhandled.
 */
async function rejection(call: () => Promise<unknown>): Promise<string> {
	try {
		await call();
	} catch (error) {
		return (error as Error).message;
	}
	throw new Error("expected the call to reject");
}

async function call(mf: Miniflare, method: string, ...args: unknown[]) {
	const response = await mf.dispatchFetch("http://placeholder", {
		method: "POST",
		body: JSON.stringify({ method, args }),
	});
	if (!response.ok) {
		throw new Error(await response.text());
	}
	const { result } = (await response.json()) as { result: unknown };
	return result;
}

describe("flagship plugin", () => {
	test("evaluates seeded flags through the binding", async ({ expect }) => {
		const mf = new Miniflare(options());
		useDispose(mf);

		const admin = (await mf.getFlagshipBindingAPI("FLAGS"))();
		await admin.createFlag(BOOL_FLAG);

		expect(
			await call(mf, "getBooleanValue", "new_checkout", false, { plan: "pro" })
		).toBe(true);
		expect(
			await call(mf, "getBooleanValue", "new_checkout", false, {
				plan: "free",
			})
		).toBe(false);
		expect(
			await call(mf, "getBooleanDetails", "new_checkout", false, {
				plan: "pro",
			})
		).toEqual({
			flagKey: "new_checkout",
			value: true,
			variant: "on",
			reason: "TARGETING_MATCH",
		});
	});

	test("returns the default value for unknown flags", async ({ expect }) => {
		const mf = new Miniflare(options());
		useDispose(mf);

		expect(await call(mf, "getStringValue", "nope", "fallback")).toBe(
			"fallback"
		);
		expect(await call(mf, "getStringDetails", "nope", "fallback")).toEqual({
			flagKey: "nope",
			value: "fallback",
			variant: "default",
			reason: "ERROR",
			errorCode: "FLAG_NOT_FOUND",
			errorMessage: "Flag 'nope' not found",
		});
	});

	test("returns the default value when the type does not match", async ({
		expect,
	}) => {
		const mf = new Miniflare(options());
		useDispose(mf);

		const admin = (await mf.getFlagshipBindingAPI("FLAGS"))();
		await admin.createFlag(BOOL_FLAG);

		expect(await call(mf, "getStringDetails", "new_checkout", "x")).toEqual({
			flagKey: "new_checkout",
			value: "x",
			variant: "default",
			reason: "ERROR",
			errorCode: "TYPE_MISMATCH",
			errorMessage: "Flag 'new_checkout' has type 'boolean', expected 'string'",
		});
	});

	test("get throws for unknown flags without a default value", async ({
		expect,
	}) => {
		const mf = new Miniflare(options());
		useDispose(mf);

		await expect(call(mf, "get", "nope")).rejects.toThrow(
			"Flag 'nope' not found"
		);
		expect(await call(mf, "get", "nope", "fallback")).toBe("fallback");
	});

	test("isolates flags by app id and shares them within one", async ({
		expect,
	}) => {
		const mf = new Miniflare(
			options({
				FLAGS: { type: "flagship", id: "app-a" },
				OTHER: { type: "flagship", id: "app-b" },
				ALIAS: { type: "flagship", id: "app-a" },
			})
		);
		useDispose(mf);

		const admin = (await mf.getFlagshipBindingAPI("FLAGS"))();
		await admin.createFlag(BOOL_FLAG);

		expect(
			await (await mf.getFlagshipBindingAPI("ALIAS"))().listFlags()
		).toEqual([expect.objectContaining({ key: "new_checkout" })]);
		expect(
			await (await mf.getFlagshipBindingAPI("OTHER"))().listFlags()
		).toEqual([]);
	});

	test("persists flags on the file system", async ({ expect }) => {
		const tmp = await useTmp();
		const opts = { ...options(), resourcePersistencePath: tmp };

		const mf1 = new Miniflare(opts);
		const admin1 = (await mf1.getFlagshipBindingAPI("FLAGS"))();
		await admin1.createFlag(BOOL_FLAG);
		await mf1.dispose();

		const mf2 = new Miniflare(opts);
		useDispose(mf2);
		expect(
			await call(mf2, "getBooleanValue", "new_checkout", false, {
				plan: "pro",
			})
		).toBe(true);
	});

	describe("admin API", () => {
		test("supports the full flag lifecycle", async ({ expect }) => {
			const mf = new Miniflare(options());
			useDispose(mf);
			const admin = (await mf.getFlagshipBindingAPI("FLAGS"))();

			expect(await admin.listFlags()).toEqual([]);

			const created = await admin.createFlag(BOOL_FLAG);
			expect(created).toMatchObject({ key: "new_checkout", enabled: true });
			expect(await admin.getFlag("new_checkout")).toEqual(created);

			await admin.updateFlag("new_checkout", { ...BOOL_FLAG, enabled: false });
			expect(await admin.getFlag("new_checkout")).toMatchObject({
				enabled: false,
			});
			expect(await admin.evaluateFlag("new_checkout", { plan: "pro" })).toEqual(
				{
					flagKey: "new_checkout",
					value: false,
					variant: "off",
					reason: "DISABLED",
				}
			);

			await admin.deleteFlag("new_checkout");
			expect(await admin.listFlags()).toEqual([]);
		});

		test("rejects invalid operations", async ({ expect }) => {
			const mf = new Miniflare(options());
			useDispose(mf);
			const admin = (await mf.getFlagshipBindingAPI("FLAGS"))();

			await admin.createFlag(BOOL_FLAG);
			expect(await rejection(() => admin.createFlag(BOOL_FLAG))).toBe(
				"Flag 'new_checkout' already exists"
			);
			expect(
				await rejection(() => admin.updateFlag("missing", BOOL_FLAG))
			).toBe("Flag 'missing' not found");
			expect(await rejection(() => admin.deleteFlag("missing"))).toBe(
				"Flag 'missing' not found"
			);
		});

		test("enforces the control-plane write invariants", async ({ expect }) => {
			const mf = new Miniflare(options());
			useDispose(mf);
			const admin = (await mf.getFlagshipBindingAPI("FLAGS"))();
			const put = (input: Partial<FlagInput>) =>
				rejection(() => admin.putFlag({ ...BOOL_FLAG, ...input } as FlagInput));

			expect(await put({ key: "not valid!" })).toBe(
				"Flag key 'not valid!' must be 1-64 alphanumeric, hyphen or underscore characters"
			);
			expect(await put({ variations: {} })).toBe(
				"Flag 'new_checkout' must define at least one variation"
			);
			expect(await put({ variations: { on: true, off: "no" } })).toBe(
				"Flag 'new_checkout' variations must all share the same type"
			);
			expect(await put({ variations: { on: null, off: null } })).toBe(
				"Flag 'new_checkout' variations cannot be null"
			);
			expect(await put({ default_variation: "nope" })).toBe(
				"Flag 'new_checkout' default variation 'nope' is not defined"
			);
			expect(
				await put({
					rules: [{ ...BOOL_FLAG.rules[0], serve_variation: "nope" }],
				})
			).toBe("Flag 'new_checkout' rule serves undefined variation 'nope'");
			expect(
				await put({ rules: [{ ...BOOL_FLAG.rules[0], priority: 0 }] })
			).toBe(
				"Flag 'new_checkout' rule priorities must be integers greater than or equal to 1"
			);
			expect(
				await put({ rules: [BOOL_FLAG.rules[0], { ...BOOL_FLAG.rules[0] }] })
			).toBe("Flag 'new_checkout' has duplicate rule priority 1");
			expect(
				await put({
					rules: [
						{ priority: 1, conditions: [], serve_variation: "on" },
						{ ...BOOL_FLAG.rules[0], priority: 2 },
					],
				})
			).toBe(
				"Flag 'new_checkout' has targeting rules after a rule with no conditions"
			);
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
			expect(
				await put({
					rules: [{ ...BOOL_FLAG.rules[0], rollout: { percentage: 101 } }],
				})
			).toBe(
				"Flag 'new_checkout' rollout percentage must be a number between 0 and 100"
			);
			expect(
				await put({
					rules: [
						{
							...BOOL_FLAG.rules[0],
							conditions: [{ logical_operator: "AND" } as never],
						},
					],
				})
			).toBe(
				"Flag 'new_checkout' has a 'AND' condition without a list of clauses"
			);
			expect(
				await put({
					rules: [
						{
							...BOOL_FLAG.rules[0],
							conditions: [
								{ attribute: "plan", operator: "sorta_equals", value: "pro" },
							] as never,
						},
					],
				})
			).toBe(
				"Flag 'new_checkout' has a condition with an unknown operator 'sorta_equals'"
			);
			expect(
				await put({
					rules: [
						{
							...BOOL_FLAG.rules[0],
							conditions: [
								{ attribute: "plan", operator: "in", value: "pro" },
							] as never,
						},
					],
				})
			).toBe(
				"Flag 'new_checkout' has a 'in' condition whose value is not a list"
			);
		});

		test("putFlag upserts", async ({ expect }) => {
			const mf = new Miniflare(options());
			useDispose(mf);
			const admin = (await mf.getFlagshipBindingAPI("FLAGS"))();

			await admin.putFlag(BOOL_FLAG);
			await admin.putFlag({ ...BOOL_FLAG, enabled: false });
			expect(await admin.listFlags()).toEqual([
				expect.objectContaining({ key: "new_checkout", enabled: false }),
			]);
		});
	});

	describe("rollout bucketing", () => {
		test("reproduces the remote app's buckets once the store is seeded", async ({
			expect,
		}) => {
			const mf = new Miniflare(options());
			useDispose(mf);

			const admin = (await mf.getFlagshipBindingAPI("FLAGS"))();
			await admin.setAccountTag(UPSTREAM_ACCOUNT_TAG);
			await admin.createFlag(ROLLOUT_FLAG);

			// `included` is the ground truth from the upstream hash vectors: a
			// rollout includes a targeting key when its bucket is below the
			// percentage. Evaluating through the binding must agree.
			for (const [targetingKey, bucket] of Object.entries(UPSTREAM_BUCKETS)) {
				const included = bucket < ROLLOUT_PERCENTAGE;
				expect({
					targetingKey,
					value: await call(mf, "getBooleanValue", "rollout_test", false, {
						targetingKey,
					}),
				}).toEqual({ targetingKey, value: included });
			}
		});

		test("seeding changes which keys land in the rollout", async ({
			expect,
		}) => {
			const keys = Object.keys(UPSTREAM_BUCKETS);
			const evaluateAll = async (mf: Miniflare) => {
				const results: boolean[] = [];
				for (const targetingKey of keys) {
					results.push(
						(await call(mf, "getBooleanValue", "rollout_test", false, {
							targetingKey,
						})) as boolean
					);
				}
				return results;
			};

			const unseeded = new Miniflare(options());
			useDispose(unseeded);
			await (
				await unseeded.getFlagshipBindingAPI("FLAGS")
			)().createFlag(ROLLOUT_FLAG);

			const seeded = new Miniflare(options());
			useDispose(seeded);
			const seededAdmin = (await seeded.getFlagshipBindingAPI("FLAGS"))();
			await seededAdmin.setAccountTag(UPSTREAM_ACCOUNT_TAG);
			await seededAdmin.createFlag(ROLLOUT_FLAG);

			expect(await evaluateAll(unseeded)).not.toEqual(
				await evaluateAll(seeded)
			);
		});

		test("exposes and persists the account tag", async ({ expect }) => {
			const tmp = await useTmp();
			const opts = { ...options(), resourcePersistencePath: tmp };

			const mf1 = new Miniflare(opts);
			const admin1 = (await mf1.getFlagshipBindingAPI("FLAGS"))();
			expect(await admin1.getAccountTag()).toBe(null);
			await admin1.setAccountTag(UPSTREAM_ACCOUNT_TAG);
			expect(await admin1.getAccountTag()).toBe(UPSTREAM_ACCOUNT_TAG);
			await mf1.dispose();

			const mf2 = new Miniflare(opts);
			useDispose(mf2);
			expect(
				await (await mf2.getFlagshipBindingAPI("FLAGS"))().getAccountTag()
			).toBe(UPSTREAM_ACCOUNT_TAG);
		});

		test("keeps the account tag out of the flag listing", async ({
			expect,
		}) => {
			const mf = new Miniflare(options());
			useDispose(mf);
			const admin = (await mf.getFlagshipBindingAPI("FLAGS"))();

			await admin.setAccountTag(UPSTREAM_ACCOUNT_TAG);
			expect(await admin.listFlags()).toEqual([]);
		});

		test("isolates the account tag by app id", async ({ expect }) => {
			const mf = new Miniflare(
				options({
					FLAGS: { type: "flagship", id: "app-a" },
					OTHER: { type: "flagship", id: "app-b" },
				})
			);
			useDispose(mf);

			await (
				await mf.getFlagshipBindingAPI("FLAGS")
			)().setAccountTag(UPSTREAM_ACCOUNT_TAG);
			expect(
				await (await mf.getFlagshipBindingAPI("OTHER"))().getAccountTag()
			).toBe(null);
		});

		test("rejects an empty account tag", async ({ expect }) => {
			const mf = new Miniflare(options());
			useDispose(mf);
			const admin = (await mf.getFlagshipBindingAPI("FLAGS"))();

			expect(await rejection(() => admin.setAccountTag(""))).toBe(
				"accountTag must be a non-empty string"
			);
		});
	});

	describe("unseeded bucketing warning", () => {
		/**
		 * Build an instance capturing the worker's structured logs, which is where
		 * `console.warn` from inside the binding surfaces.
		 */
		function withCapturedLogs() {
			const warnings: string[] = [];
			const mf = new Miniflare({
				...options(),
				handleStructuredLogs: ({ level, message }) => {
					if (level === "warn") {
						warnings.push(message);
					}
				},
			});
			return { mf, warnings };
		}

		async function evaluateRollout(mf: Miniflare, targetingKey: string) {
			return call(mf, "getBooleanValue", "rollout_test", false, {
				targetingKey,
			});
		}

		test("warns once per session when a rollout is evaluated unseeded", async ({
			expect,
		}) => {
			const { mf, warnings } = withCapturedLogs();
			useDispose(mf);
			await (
				await mf.getFlagshipBindingAPI("FLAGS")
			)().createFlag(ROLLOUT_FLAG);

			for (const targetingKey of ["0", "1", "2"]) {
				await evaluateRollout(mf, targetingKey);
			}

			expect(warnings).toEqual([
				"Flagship: flag 'rollout_test' has a percentage rollout, but the local flag store has no account tag, so its buckets will not match your remote app. Run `wrangler flagship flags pull` to seed the store.",
			]);
		});

		test("stays quiet once the store is seeded", async ({ expect }) => {
			const { mf, warnings } = withCapturedLogs();
			useDispose(mf);
			const admin = (await mf.getFlagshipBindingAPI("FLAGS"))();
			await admin.setAccountTag(UPSTREAM_ACCOUNT_TAG);
			await admin.createFlag(ROLLOUT_FLAG);

			await evaluateRollout(mf, "0");

			expect(warnings).toEqual([]);
		});

		test("stays quiet for flags without a partial rollout", async ({
			expect,
		}) => {
			const { mf, warnings } = withCapturedLogs();
			useDispose(mf);
			const admin = (await mf.getFlagshipBindingAPI("FLAGS"))();
			await admin.createFlag(BOOL_FLAG);
			await admin.createFlag({
				...ROLLOUT_FLAG,
				key: "full_rollout",
				rules: [{ ...ROLLOUT_FLAG.rules[0], rollout: { percentage: 100 } }],
			});

			await call(mf, "getBooleanValue", "new_checkout", false, { plan: "pro" });
			await call(mf, "getBooleanValue", "full_rollout", false, {
				targetingKey: "0",
			});

			expect(warnings).toEqual([]);
		});
	});
	describe("persistence", () => {
		test("sees writes made by another instance sharing the store", async ({
			expect,
		}) => {
			const tmp = await useTmp();
			const first = new Miniflare({
				...options(),
				resourcePersistencePath: tmp,
			});
			useDispose(first);
			const firstAdmin = (await first.getFlagshipBindingAPI("FLAGS"))();
			expect(await firstAdmin.listFlags()).toEqual([]);

			const second = new Miniflare({
				...options(),
				resourcePersistencePath: tmp,
			});
			const secondAdmin = (await second.getFlagshipBindingAPI("FLAGS"))();
			await secondAdmin.createFlag(BOOL_FLAG);
			await second.dispose();

			expect(
				(await firstAdmin.listFlags()).map((flag) => flag.key)
			).toStrictEqual(["new_checkout"]);
		});

		test("accepts a fractional rollout percentage", async ({ expect }) => {
			const mf = new Miniflare(options());
			useDispose(mf);
			const admin = (await mf.getFlagshipBindingAPI("FLAGS"))();

			const flag = await admin.putFlag({
				...BOOL_FLAG,
				rules: [{ ...BOOL_FLAG.rules[0], rollout: { percentage: 33.333333 } }],
			});

			expect(flag.rules[0].rollout).toEqual({ percentage: 33.333333 });
		});

		test("patchFlag only changes the fields it is given", async ({
			expect,
		}) => {
			const mf = new Miniflare(options());
			useDispose(mf);
			const admin = (await mf.getFlagshipBindingAPI("FLAGS"))();
			await admin.createFlag(BOOL_FLAG);

			await admin.patchFlag("new_checkout", { description: "now described" });

			expect(await admin.getFlag("new_checkout")).toEqual(
				expect.objectContaining({
					description: "now described",
					enabled: true,
					rules: BOOL_FLAG.rules,
				})
			);
		});

		test("putFlags rejects the whole batch when one flag is invalid", async ({
			expect,
		}) => {
			const mf = new Miniflare(options());
			useDispose(mf);
			const admin = (await mf.getFlagshipBindingAPI("FLAGS"))();

			expect(
				await rejection(() =>
					admin.putFlags(
						[BOOL_FLAG, { ...BOOL_FLAG, key: "second", variations: {} }],
						"tag"
					)
				)
			).toBe("Flag 'second' must define at least one variation");

			expect(await admin.listFlags()).toEqual([]);
			expect(await admin.getAccountTag()).toBeNull();
		});

		test("putFlags rejects an empty account tag", async ({ expect }) => {
			const mf = new Miniflare(options());
			useDispose(mf);
			const admin = (await mf.getFlagshipBindingAPI("FLAGS"))();

			expect(await rejection(() => admin.putFlags([BOOL_FLAG], ""))).toBe(
				"accountTag must be a non-empty string"
			);
			expect(await admin.listFlags()).toEqual([]);
			expect(await admin.getAccountTag()).toBeNull();
		});
	});
});
