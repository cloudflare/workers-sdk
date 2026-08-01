import { describe, it } from "vitest";
import { bindings } from "../bindings";
import { applyMode, UnknownModeError } from "../modes";
import { defineWorker } from "../worker-definition";
import type {
	InferAggregatedEnv,
	InferEnvForMode,
	InferModeNames,
	UnwrapConfig,
} from "../inference";
import type { ParsedInputWorkerConfig } from "../schema";

const baseConfig = {
	type: "worker",
	name: "my-worker",
	compatibilityDate: "2026-06-01",
	env: {},
} satisfies ParsedInputWorkerConfig;

describe("applyMode", () => {
	it("returns the base config when no mode is selected", ({ expect }) => {
		const result = applyMode(
			{
				...baseConfig,
				env: { SHARED: { type: "kv" } },
				modes: { production: { env: { API_KEY: { type: "secret" } } } },
			},
			undefined
		);

		expect(result).toEqual({
			type: "worker",
			name: "my-worker",
			compatibilityDate: "2026-06-01",
			env: { SHARED: { type: "kv" } },
		});
	});

	it("strips `modes` from the result", ({ expect }) => {
		const result = applyMode(
			{ ...baseConfig, modes: { production: {} } },
			"production"
		);

		expect(result).not.toHaveProperty("modes");
	});

	it("is a no-op for a config without modes", ({ expect }) => {
		const result = applyMode({ ...baseConfig }, undefined);

		expect(result).toEqual(baseConfig);
	});

	it("merges `env` per binding, keeping bindings the mode does not mention", ({
		expect,
	}) => {
		const result = applyMode(
			{
				...baseConfig,
				env: { SHARED: { type: "kv" }, OVERRIDDEN: { type: "kv" } },
				modes: {
					production: {
						env: {
							OVERRIDDEN: { type: "r2", name: "prod-bucket" },
							ADDED: { type: "secret" },
						},
					},
				},
			},
			"production"
		);

		expect(result.env).toEqual({
			SHARED: { type: "kv" },
			OVERRIDDEN: { type: "r2", name: "prod-bucket" },
			ADDED: { type: "secret" },
		});
	});

	it("merges `exports` per key", ({ expect }) => {
		const result = applyMode(
			{
				...baseConfig,
				exports: { Counter: { type: "durable-object", storage: "sqlite" } },
				modes: {
					production: {
						exports: {
							Sessions: { type: "durable-object", storage: "sqlite" },
						},
					},
				},
			},
			"production"
		);

		expect(result.exports).toEqual({
			Counter: { type: "durable-object", storage: "sqlite" },
			Sessions: { type: "durable-object", storage: "sqlite" },
		});
	});

	it("replaces scalar fields rather than merging them", ({ expect }) => {
		const result = applyMode(
			{
				...baseConfig,
				name: "my-worker",
				logpush: false,
				modes: { production: { name: "my-worker-prod", logpush: true } },
			},
			"production"
		);

		expect(result.name).toBe("my-worker-prod");
		expect(result.logpush).toBe(true);
	});

	it("replaces arrays outright so an inherited flag can always be dropped", ({
		expect,
	}) => {
		const result = applyMode(
			{
				...baseConfig,
				compatibilityFlags: ["nodejs_compat", "no_global_navigator"],
				modes: { production: { compatibilityFlags: ["nodejs_compat"] } },
			},
			"production"
		);

		expect(result.compatibilityFlags).toEqual(["nodejs_compat"]);
	});

	it("leaves base fields the mode does not mention untouched", ({ expect }) => {
		const result = applyMode(
			{
				...baseConfig,
				compatibilityFlags: ["nodejs_compat"],
				logpush: true,
				modes: { production: { name: "my-worker-prod" } },
			},
			"production"
		);

		expect(result.compatibilityFlags).toEqual(["nodejs_compat"]);
		expect(result.logpush).toBe(true);
	});

	it("throws under `strict` for a mode the config does not declare", ({
		expect,
	}) => {
		expect(() =>
			applyMode(
				{ ...baseConfig, modes: { staging: {}, production: {} } },
				"prod",
				{ strict: true }
			)
		).toThrow(UnknownModeError);

		expect(() =>
			applyMode(
				{ ...baseConfig, modes: { staging: {}, production: {} } },
				"prod",
				{ strict: true }
			)
		).toThrow(`No mode named "prod" is defined in your config.`);
	});

	it("falls back to the base config for an undeclared mode when not strict", ({
		expect,
	}) => {
		// Vite always supplies a mode ("development" for `vite dev`), and a config
		// is not obliged to declare one for it. Erroring here would refuse to start
		// the dev server for any config that uses modes at all.
		const result = applyMode(
			{
				...baseConfig,
				env: { SHARED: { type: "kv" } },
				modes: { staging: {}, production: {} },
			},
			"development"
		);

		expect(result.env).toEqual({ SHARED: { type: "kv" } });
		expect(result).not.toHaveProperty("modes");
	});

	it("lists the available modes on the thrown error", ({ expect }) => {
		try {
			applyMode(
				{ ...baseConfig, modes: { staging: {}, production: {} } },
				"prod",
				{ strict: true }
			);
			expect.unreachable("applyMode should have thrown");
		} catch (e) {
			expect(e).toBeInstanceOf(UnknownModeError);
			const error = e as UnknownModeError;
			expect(error.mode).toBe("prod");
			expect(error.availableModes).toEqual(["staging", "production"]);
			expect(error.message).toContain(
				`Available modes: "staging", "production"`
			);
		}
	});

	// `modes` is an ordinary object, so a bare `modes[mode]` lookup would find
	// these on Object.prototype and mistake them for a declared mode.
	for (const inherited of ["toString", "constructor", "valueOf", "__proto__"]) {
		it(`does not treat the inherited property ${inherited} as a declared mode`, ({
			expect,
		}) => {
			expect(() =>
				applyMode({ ...baseConfig, modes: { staging: {} } }, inherited, {
					strict: true,
				})
			).toThrow(UnknownModeError);

			const result = applyMode(
				{
					...baseConfig,
					env: { SHARED: { type: "kv" } },
					modes: { staging: {} },
				},
				inherited
			);
			expect(result.env).toEqual({ SHARED: { type: "kv" } });
		});
	}

	it("passes a config without modes through untouched, whatever the mode", ({
		expect,
	}) => {
		// The function form of a config receives `ctx.mode` and may branch on it
		// itself, so there is nothing to select here and nothing to complain about.
		const result = applyMode({ ...baseConfig }, "production");

		expect(result).toEqual(baseConfig);
	});
});

// Type-level behaviour is the point of this feature, so it is asserted at
// compile time. A regression in the inference helpers fails `tsc`, not vitest.
describe("mode type inference", () => {
	const config = defineWorker({
		name: "my-worker",
		compatibilityDate: "2026-06-01",
		env: { SHARED_KV: bindings.kv() },
		modes: {
			staging: { env: { API_KEY: bindings.secret() } },
			production: {
				env: { API_KEY: bindings.secret(), ANALYTICS: bindings.r2() },
			},
		},
	});

	type Config = UnwrapConfig<typeof config>;

	it("infers the declared mode names", ({ expect }) => {
		type Modes = InferModeNames<Config>;
		const modes: Modes[] = ["staging", "production"];

		expect(modes).toEqual(["staging", "production"]);
	});

	it("layers a mode's bindings over the base bindings", ({ expect }) => {
		type StagingEnv = InferEnvForMode<Config, "staging">;
		const staging: StagingEnv = {
			SHARED_KV: {} as KVNamespace,
			API_KEY: "secret-value",
		};

		expect(staging.API_KEY).toBe("secret-value");
	});

	it("requires bindings every mode declares and makes the rest optional", ({
		expect,
	}) => {
		type AggregatedEnv = InferAggregatedEnv<Config>;

		// `ANALYTICS` is production-only, so it is optional here. Omitting it must
		// still type check.
		const aggregated: AggregatedEnv = {
			SHARED_KV: {} as KVNamespace,
			API_KEY: "secret-value",
		};

		// `SHARED_KV` and `API_KEY` are in every mode, so they are required.
		type SharedIsRequired = undefined extends AggregatedEnv["SHARED_KV"]
			? false
			: true;
		const sharedIsRequired: SharedIsRequired = true;

		type AnalyticsIsOptional = AggregatedEnv extends { ANALYTICS?: unknown }
			? AggregatedEnv extends { ANALYTICS: unknown }
				? false
				: true
			: false;
		const analyticsIsOptional: AnalyticsIsOptional = true;

		expect(aggregated.ANALYTICS).toBeUndefined();
		expect(sharedIsRequired).toBe(true);
		expect(analyticsIsOptional).toBe(true);
	});

	it("falls back to the plain env for a config without modes", ({ expect }) => {
		const plain = defineWorker({
			name: "my-worker",
			compatibilityDate: "2026-06-01",
			env: { SHARED_KV: bindings.kv() },
		});

		type PlainEnv = InferAggregatedEnv<UnwrapConfig<typeof plain>>;
		const env: PlainEnv = { SHARED_KV: {} as KVNamespace };

		type HasNoModes = [InferModeNames<UnwrapConfig<typeof plain>>] extends [
			never,
		]
			? true
			: false;
		const hasNoModes: HasNoModes = true;

		expect(env).toBeDefined();
		expect(hasNoModes).toBe(true);
	});
});
