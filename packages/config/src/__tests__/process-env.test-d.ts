import { bindings } from "../bindings";
import { defineWorker } from "../definition";
import type {
	InferProcessEnv as InferProcessEnvWithDate,
	UnwrapConfig,
} from "../inference";
import type { NODEJS_COMPAT_DEFAULT_ON_DATE } from "@cloudflare/workers-utils/compatibility-date";
type InferProcessEnv<T> = InferProcessEnvWithDate<
	T,
	typeof NODEJS_COMPAT_DEFAULT_ON_DATE
>;

type Equal<T, U> = [T] extends [U] ? ([U] extends [T] ? true : false) : false;
type Assert<T extends true> = T;

const env = {
	API_TOKEN: bindings.secret(),
	PUBLIC_LABEL: bindings.text("production"),
	SETTINGS: bindings.json({ retries: 3 }),
	JSON_TEXT: bindings.json("hello"),
	BUCKET: bindings.r2({ name: "assets" }),
};

type WithDate<
	D extends string,
	F extends readonly string[] = [],
> = InferProcessEnv<{
	compatibilityDate: D;
	compatibilityFlags: F;
	env: typeof env;
}>;
type Populated = {
	API_TOKEN: string;
	PUBLIC_LABEL: "production";
	SETTINGS: string;
	JSON_TEXT: "hello";
};

export type DefaultBefore = Assert<
	Equal<WithDate<"2026-08-03">, Record<never, never>>
>;
export type DefaultBoundary = Assert<Equal<WithDate<"2026-08-04">, Populated>>;
export type DefaultAfter = Assert<Equal<WithDate<"2026-10-02">, Populated>>;
export type FutureYear = Assert<Equal<WithDate<"2027-01-01">, Populated>>;
export type BeforePopulation = Assert<
	Equal<WithDate<"2025-03-31", ["nodejs_compat"]>, Record<never, never>>
>;
export type PopulationBoundary = Assert<
	Equal<WithDate<"2025-04-01", ["nodejs_compat"]>, Populated>
>;
export type ExplicitPopulation = Assert<
	Equal<
		WithDate<
			"2024-12-01",
			["nodejs_compat", "nodejs_compat_populate_process_env"]
		>,
		Populated
	>
>;
export type PopulationWithoutNode = Assert<
	Equal<
		WithDate<"2025-06-01", ["nodejs_compat_populate_process_env"]>,
		Record<never, never>
	>
>;
export type NoNode = Assert<
	Equal<WithDate<"2026-10-02", ["no_nodejs_compat"]>, Record<never, never>>
>;
export type V2Alone = Assert<
	Equal<WithDate<"2025-06-01", ["nodejs_compat_v2"]>, Record<never, never>>
>;
export type NoPopulation = Assert<
	Equal<
		WithDate<"2026-10-02", ["nodejs_compat_do_not_populate_process_env"]>,
		Record<never, never>
	>
>;
export type UnknownFlags = Assert<
	Equal<WithDate<"2026-10-02", string[]>, Record<never, never>>
>;
export type UnknownDate = Assert<Equal<WithDate<string>, Record<never, never>>>;
export type NoEnv = Assert<
	Equal<
		InferProcessEnv<{ compatibilityDate: "2026-10-02" }>,
		Record<never, never>
	>
>;

const worker = defineWorker({
	name: "api",
	compatibilityDate: "2026-10-02",
	env,
});
export type InferredConfig = Assert<
	Equal<InferProcessEnv<typeof worker>, Populated>
>;

const previewWorker = defineWorker({
	name: "preview",
	compatibilityDate: "2026-10-02",
	env: { API_TOKEN: env.API_TOKEN, PREVIEW: bindings.text("true") },
});
const productionWorker = defineWorker({
	name: "production",
	compatibilityDate: "2026-10-02",
	env: { API_TOKEN: env.API_TOKEN },
});
const branchedWorker = defineWorker((ctx) =>
	ctx.isPreview ? previewWorker : productionWorker
);
export type OptionalBranchBinding = Assert<
	Equal<
		InferProcessEnv<UnwrapConfig<typeof branchedWorker>>,
		{ API_TOKEN: string; PREVIEW?: "true" }
	>
>;

const branchedPopulation = defineWorker((ctx) =>
	ctx.isPreview
		? {
				name: "preview",
				compatibilityDate: "2026-10-02",
				compatibilityFlags: ["nodejs_compat_do_not_populate_process_env"],
				env,
			}
		: { name: "production", compatibilityDate: "2026-10-02", env }
);
export type OptionalPopulation = Assert<
	Equal<
		InferProcessEnv<UnwrapConfig<typeof branchedPopulation>>,
		Partial<Populated>
	>
>;

const previewEnv = {
	LABEL: bindings.text("preview"),
	PREVIEW: bindings.secret(),
};
const productionEnv = { LABEL: bindings.text("production") };
const branchedEnv = defineWorker((ctx) => ({
	name: "api",
	compatibilityDate: "2026-10-02" as const,
	env: ctx.isPreview ? previewEnv : productionEnv,
}));
export type EnvUnion = Assert<
	Equal<
		InferProcessEnv<UnwrapConfig<typeof branchedEnv>>,
		{ LABEL: "preview" | "production"; PREVIEW?: string }
	>
>;
