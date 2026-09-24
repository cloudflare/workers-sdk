import {
	defineConfig,
	defineContainer,
	defineWorker,
	type ContainerDefinition,
} from "../definition";
import { exports as workerExports } from "../exports";
import type { DurableObjectStorageOptions } from "../exports";
import type { UnwrapConfig } from "../inference";
import type { ContainerConfig } from "../types";

const objectContainer = defineContainer({
	name: "object-container",
	image: { dockerfile: "./Dockerfile", buildVars: { NODE_VERSION: "24" } },
	observability: { targetInstancePercentage: 50 },
});

const factoryContainer = defineContainer((ctx) => ({
	name: `factory-container-${ctx.mode}`,
	image: { reference: "registry.example.com/container:latest" },
}));

const promisedContainer = defineContainer(
	Promise.resolve({
		name: "promised-container",
		image: { dockerfile: "./Dockerfile" },
	})
);

const durableObjectContainer = defineContainer({
	name: "durable-object-container",
	schedulingPolicy: "durable-object",
	images: {
		primary: { dockerfile: "./Dockerfile" },
		fallback: { reference: "registry.example.com/fallback:latest" },
	},
	observability: { enabled: true, logs: { enabled: true } },
});

const standaloneContainer = defineContainer({
	name: "standalone-container",
	image: { dockerfile: "./Dockerfile" },
});

const worker = defineWorker({
	name: "worker",
	compatibilityDate: "2026-06-24",
	exports: {
		ObjectContainerDO: workerExports.durableObject({
			storage: "sqlite",
			container: objectContainer,
		}),
		FactoryContainerDO: workerExports.durableObject({
			storage: "sqlite",
			container: factoryContainer,
		}),
		PromisedContainerDO: workerExports.durableObject({
			storage: "sqlite",
			container: promisedContainer,
		}),
		DurableObjectContainerDO: workerExports.durableObject({
			storage: "sqlite",
			container: durableObjectContainer,
		}),
	},
});

const config = defineConfig({
	worker,
	containers: [
		objectContainer,
		factoryContainer,
		promisedContainer,
		durableObjectContainer,
		standaloneContainer,
	],
});

workerExports.durableObject({
	storage: "legacy-kv",
	// @ts-expect-error Containers require SQLite Durable Object storage.
	container: objectContainer,
});

const invalidObservabilityTargets: ContainerConfig = {
	name: "invalid-observability",
	image: { dockerfile: "./Dockerfile" },
	observability: {
		targetInstancePercentage: 50,
		// @ts-expect-error Observability targets are mutually exclusive.
		targetInstanceCount: 2,
	},
};
void invalidObservabilityTargets;

const invalidDurableObjectObservability: ContainerConfig = {
	name: "invalid-durable-object-observability",
	schedulingPolicy: "durable-object",
	observability: {
		// @ts-expect-error Durable Object-managed Containers do not support instance targeting.
		targetInstanceCount: 2,
	},
};
void invalidDurableObjectObservability;

type Equal<T, U> =
	(<V>() => V extends T ? 1 : 2) extends <V>() => V extends U ? 1 : 2
		? true
		: false;
type Assert<T extends true> = T;

export type ObjectContainerNameTest = Assert<
	Equal<UnwrapConfig<typeof objectContainer>["name"], "object-container">
>;
export type FactoryContainerDefinitionTest = Assert<
	typeof factoryContainer extends ContainerDefinition ? true : false
>;
export type PromisedContainerDefinitionTest = Assert<
	typeof promisedContainer extends ContainerDefinition ? true : false
>;
export type DurableObjectContainerDefinitionTest = Assert<
	typeof durableObjectContainer extends ContainerDefinition ? true : false
>;
export type StringContainerReferenceTest = Assert<
	Equal<
		string extends Extract<
			DurableObjectStorageOptions,
			{ storage: "sqlite" }
		>["container"]
			? true
			: false,
		false
	>
>;
export type ConfigContainerTest = Assert<
	Equal<
		UnwrapConfig<typeof config>["containers"][4]["name"],
		"standalone-container"
	>
>;
