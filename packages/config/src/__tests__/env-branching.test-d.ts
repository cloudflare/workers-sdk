import { bindings } from "../bindings";
import { defineConfig, defineWorker } from "../definition";
import type { InferEnv, UnwrapConfig } from "../inference";

type Equal<T, U> =
	(<V>() => V extends T ? 1 : 2) extends <V>() => V extends U ? 1 : 2
		? true
		: false;
type Equivalent<T, U> = [T] extends [U]
	? [U] extends [T]
		? true
		: false
	: false;
type Assert<T extends true> = T;

type PreviewJob = {
	kind: "dry-run";
	messageId: string;
};

type ProductionJob = {
	kind: "deliver";
	messageId: string;
	recipient: string;
};

const previewAppConfig = {
	environment: "preview",
	apiOrigin: "https://preview-api.example.com",
	diagnostics: { traceSampling: 1 },
} as const;

const productionAppConfig = {
	environment: "production",
	apiOrigin: "https://api.example.com",
	diagnostics: false,
} as const;

const branchedConfig = defineConfig((ctx) =>
	ctx.isPreview
		? {
				worker: {
					name: "preview-app",
					compatibilityDate: "2026-09-28",
					env: {
						APP_CONFIG: bindings.json(previewAppConfig),
						JOBS: bindings.queue<PreviewJob>({ name: "preview-jobs" }),
					},
				},
			}
		: {
				worker: {
					name: "production-app",
					compatibilityDate: "2026-09-28",
					env: {
						APP_CONFIG: bindings.json(productionAppConfig),
						JOBS: bindings.queue<ProductionJob>({ name: "production-jobs" }),
					},
				},
			}
);

const configWithUnmatchedEnvKeys = defineConfig((ctx) =>
	ctx.isPreview
		? {
				worker: {
					name: "preview-app-with-unmatched-env-keys",
					compatibilityDate: "2026-10-08",
					env: {
						PREVIEW_JOBS: bindings.queue<PreviewJob>({
							name: "preview-jobs",
						}),
					},
				},
			}
		: {
				worker: {
					name: "production-app-with-unmatched-env-keys",
					compatibilityDate: "2026-10-08",
					env: {
						PRODUCTION_JOBS: bindings.queue<ProductionJob>({
							name: "production-jobs",
						}),
					},
				},
			}
);

declare const includeConditionalBindings: boolean;

const workerWithConditionalBindings = defineWorker({
	name: "worker-with-conditional-bindings",
	compatibilityDate: "2026-10-08",
	env: {
		ALWAYS: bindings.text("always"),
		ALWAYS_FALSE: false,
		ALWAYS_NULL: null,
		ALWAYS_UNDEFINED: undefined,
		AND_EXPRESSION:
			includeConditionalBindings && bindings.text("and-expression"),
		NULL_TERNARY: includeConditionalBindings
			? bindings.text("null-ternary")
			: null,
		UNDEFINED_TERNARY: includeConditionalBindings
			? bindings.text("undefined-ternary")
			: undefined,
	},
});

const branchedWorker = defineWorker((ctx) => ({
	name: "worker",
	compatibilityDate: "2026-09-28",
	env: ctx.isPreview
		? {
				APP_CONFIG: bindings.json(previewAppConfig),
				JOBS: bindings.queue<PreviewJob>({ name: "preview-jobs" }),
			}
		: {
				APP_CONFIG: bindings.json(productionAppConfig),
				JOBS: bindings.queue<ProductionJob>({ name: "production-jobs" }),
			},
}));

const workerWithoutEnv = defineWorker({
	name: "worker-without-env",
	compatibilityDate: "2026-09-28",
});

const previewWorkerWithUnmatchedEnvKeys = {
	name: "preview-worker-with-unmatched-env-keys",
	compatibilityDate: "2026-09-28",
	env: {
		APP_CONFIG: bindings.json(previewAppConfig),
		PREVIEW_JOBS: bindings.queue<PreviewJob>({ name: "preview-jobs" }),
	},
};

const productionWorkerWithUnmatchedEnvKeys = {
	name: "production-worker-with-unmatched-env-keys",
	compatibilityDate: "2026-09-28",
	env: {
		APP_CONFIG: bindings.json(productionAppConfig),
		PRODUCTION_JOBS: bindings.queue<ProductionJob>({
			name: "production-jobs",
		}),
	},
};

const workerWithUnmatchedEnvKeys = defineWorker((ctx) =>
	ctx.isPreview
		? previewWorkerWithUnmatchedEnvKeys
		: productionWorkerWithUnmatchedEnvKeys
);

const workerWithMissingEnvBranch = defineWorker((ctx) =>
	ctx.isPreview
		? {
				name: "worker-with-preview-env",
				compatibilityDate: "2026-09-28",
				env: {
					APP_CONFIG: bindings.json(previewAppConfig),
					JOBS: bindings.queue<PreviewJob>({ name: "preview-jobs" }),
				},
			}
		: {
				name: "worker-without-production-env",
				compatibilityDate: "2026-09-28",
			}
);

type Config = UnwrapConfig<typeof branchedConfig>;
type Worker = UnwrapConfig<Config["worker"]>;
type Env = InferEnv<Worker>;
type ConfigWithUnmatchedEnvKeys = UnwrapConfig<
	typeof configWithUnmatchedEnvKeys
>;
type WorkerWithInlineUnmatchedEnvKeys = UnwrapConfig<
	ConfigWithUnmatchedEnvKeys["worker"]
>;
type InlineUnmatchedEnv = InferEnv<WorkerWithInlineUnmatchedEnvKeys>;
type ConditionalEnv = InferEnv<
	UnwrapConfig<typeof workerWithConditionalBindings>
>;
type DefinedWorkerEnv = InferEnv<UnwrapConfig<typeof branchedWorker>>;
type WorkerWithoutEnv = UnwrapConfig<typeof workerWithoutEnv>;
type InferredEnvWithoutEnv = InferEnv<WorkerWithoutEnv>;
type WorkerWithUnmatchedEnvKeys = UnwrapConfig<
	typeof workerWithUnmatchedEnvKeys
>;
type UnmatchedEnv = InferEnv<WorkerWithUnmatchedEnvKeys>;
type WorkerWithMissingEnvBranch = UnwrapConfig<
	typeof workerWithMissingEnvBranch
>;
type MissingEnvBranch = InferEnv<WorkerWithMissingEnvBranch>;

type ExpectedEnv = {
	APP_CONFIG: typeof previewAppConfig | typeof productionAppConfig;
	JOBS: Queue<PreviewJob> | Queue<ProductionJob>;
};
type ExpectedUnmatchedEnv = {
	APP_CONFIG: typeof previewAppConfig | typeof productionAppConfig;
	PREVIEW_JOBS?: Queue<PreviewJob>;
	PRODUCTION_JOBS?: Queue<ProductionJob>;
};
type ExpectedMissingEnvBranch = {
	APP_CONFIG?: typeof previewAppConfig;
	JOBS?: Queue<PreviewJob>;
};
type ExpectedInlineUnmatchedEnv = {
	PREVIEW_JOBS?: Queue<PreviewJob>;
	PRODUCTION_JOBS?: Queue<ProductionJob>;
};
type ExpectedConditionalEnv = {
	ALWAYS: "always";
	AND_EXPRESSION?: "and-expression";
	NULL_TERNARY?: "null-ternary";
	UNDEFINED_TERNARY?: "undefined-ternary";
};

export type BranchedEnvMergesBranchesTest = Assert<
	Equivalent<Env, ExpectedEnv>
>;
export type DefineWorkerEnvMergesBranchesTest = Assert<
	Equivalent<DefinedWorkerEnv, ExpectedEnv>
>;
export type WorkerWithoutEnvInfersEmptyEnvTest = Assert<
	Equivalent<InferredEnvWithoutEnv, Record<never, never>>
>;
export type WorkerWithoutEnvHasNoKeysTest = Assert<
	Equal<keyof InferredEnvWithoutEnv, never>
>;
export type UnmatchedEnvMakesBranchKeysOptionalTest = Assert<
	Equivalent<UnmatchedEnv, ExpectedUnmatchedEnv>
>;
export type MissingEnvBranchMakesBindingsOptionalTest = Assert<
	Equivalent<MissingEnvBranch, ExpectedMissingEnvBranch>
>;
export type InlineUnmatchedEnvMakesBranchKeysOptionalTest = Assert<
	Equivalent<InlineUnmatchedEnv, ExpectedInlineUnmatchedEnv>
>;
export type ConditionalBindingValuesMakeKeysOptionalTest = Assert<
	Equivalent<ConditionalEnv, ExpectedConditionalEnv>
>;
export type AlwaysOmittedBindingValuesHaveNoKeysTest = Assert<
	Equal<keyof ConditionalEnv, keyof ExpectedConditionalEnv>
>;

export type BranchedJsonBindingTest = Assert<
	Equal<Env["APP_CONFIG"], typeof previewAppConfig | typeof productionAppConfig>
>;

export type BranchedQueueBindingTest = Assert<
	Equal<Env["JOBS"], Queue<PreviewJob> | Queue<ProductionJob>>
>;

export type BranchedEnvKeysTest = Assert<
	Equal<keyof Env, "APP_CONFIG" | "JOBS">
>;

export type DefineWorkerBranchedJsonBindingTest = Assert<
	Equal<
		DefinedWorkerEnv["APP_CONFIG"],
		typeof previewAppConfig | typeof productionAppConfig
	>
>;

export type DefineWorkerBranchedQueueBindingTest = Assert<
	Equal<DefinedWorkerEnv["JOBS"], Queue<PreviewJob> | Queue<ProductionJob>>
>;

// This matches how generated Worker types consume InferEnv.
// oxlint-disable-next-line typescript-eslint/no-empty-object-type -- the generated interface is intentionally empty
export interface GeneratedEnvCanExtendBranchedEnvTest extends Env {}

// oxlint-disable-next-line typescript-eslint/no-empty-object-type -- the generated interface is intentionally empty
export interface GeneratedEnvCanExtendDefineWorkerEnvTest extends DefinedWorkerEnv {}

// oxlint-disable-next-line typescript-eslint/no-empty-object-type -- the generated interface is intentionally empty
export interface GeneratedEnvCanExtendWorkerWithoutEnvTest extends InferredEnvWithoutEnv {}

// oxlint-disable-next-line typescript-eslint/no-empty-object-type -- the generated interface is intentionally empty
export interface GeneratedEnvCanExtendUnmatchedEnvTest extends UnmatchedEnv {}

// oxlint-disable-next-line typescript-eslint/no-empty-object-type -- the generated interface is intentionally empty
export interface GeneratedEnvCanExtendMissingEnvBranchTest extends MissingEnvBranch {}

// oxlint-disable-next-line typescript-eslint/no-empty-object-type -- the generated interface is intentionally empty
export interface GeneratedEnvCanExtendInlineUnmatchedEnvTest extends InlineUnmatchedEnv {}

// oxlint-disable-next-line typescript-eslint/no-empty-object-type -- the generated interface is intentionally empty
export interface GeneratedEnvCanExtendConditionalEnvTest extends ConditionalEnv {}
