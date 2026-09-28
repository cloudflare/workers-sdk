import { bindings } from "../bindings";
import { defineConfig, defineWorker } from "../definition";
import { exports as workerExports } from "../exports";
import type {
	InferDurableNamespaces,
	InferEnv,
	InferMainModule,
	UnwrapConfig,
} from "../inference";

type Equal<T, U> =
	(<V>() => V extends T ? 1 : 2) extends <V>() => V extends U ? 1 : 2
		? true
		: false;
type Assert<T extends true> = T;

const entrypoint = { default: { fetch: () => new Response() } };
const projectConfig = defineConfig({
	worker: defineWorker({
		name: "project-worker",
		compatibilityDate: "2026-09-17",
		entrypoint,
		env: { MESSAGE: bindings.text("hello") },
		exports: {
			Counter: workerExports.durableObject({ storage: "sqlite" }),
			Greeting: workerExports.workflow({ name: "greeting" }),
		},
	}),
});

const inlineConfig = defineConfig({
	worker: {
		name: "inline-worker",
		compatibilityDate: "2026-09-25",
		env: { MESSAGE: bindings.text("inline") },
	},
	containers: [
		{
			name: "inline-container",
			image: { dockerfile: "./Dockerfile" },
		},
	],
});

// @ts-expect-error a workflow export requires a name
workerExports.workflow({ limits: { steps: 10 } });

defineConfig({ accountId: "account-id", complianceRegion: "public" });
const plainConfig = {
	worker: {
		name: "plain-worker",
		compatibilityDate: "2026-09-17",
		env: { MESSAGE: bindings.text("hello") },
	},
} as const;

type ProjectWorker = UnwrapConfig<UnwrapConfig<typeof projectConfig>["worker"]>;
type InlineConfig = UnwrapConfig<typeof inlineConfig>;
type InlineWorker = UnwrapConfig<InlineConfig["worker"]>;

export type PlainConfigWorkerEnvTest = Assert<
	Equal<
		InferEnv<UnwrapConfig<(typeof plainConfig)["worker"]>>["MESSAGE"],
		"hello"
	>
>;
export type ProjectConfigEnvTest = Assert<
	Equal<InferEnv<ProjectWorker>["MESSAGE"], "hello">
>;
export type ProjectConfigMainModuleTest = Assert<
	Equal<InferMainModule<ProjectWorker>, typeof entrypoint>
>;
export type ProjectConfigDurableNamespaceTest = Assert<
	Equal<InferDurableNamespaces<ProjectWorker>, "Counter">
>;
export type InlineConfigWorkerNameTest = Assert<
	Equal<InlineWorker["name"], "inline-worker">
>;
export type InlineConfigWorkerEnvTest = Assert<
	Equal<InferEnv<InlineWorker>["MESSAGE"], "inline">
>;
export type InlineConfigContainerNameTest = Assert<
	Equal<InlineConfig["containers"][0]["name"], "inline-container">
>;
