import { defineContainer } from "../container-definition";
import { exports as workerExports } from "../exports";
import { defineWorker } from "../worker-definition";
import type { ParsedConfigExports } from "../config-loader";
import type {
	ContainerConfigExport,
	ContainerConfigInput,
} from "../container-definition";
import type { DurableObjectStorageOptions } from "../exports";
import type { UnwrapConfig } from "../inference";
import type { ParsedInputWorkerConfig } from "../schema";

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
	observability: { targetInstanceCount: 2 },
});

defineWorker({
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

workerExports.durableObject({
	storage: "legacy-kv",
	// @ts-expect-error Containers require SQLite Durable Object storage.
	container: objectContainer,
});

const invalidObservabilityTargets: ContainerConfigInput = {
	name: "invalid-observability",
	image: { dockerfile: "./Dockerfile" },
	observability: {
		targetInstancePercentage: 50,
		// @ts-expect-error Observability targets are mutually exclusive.
		targetInstanceCount: 2,
	},
};
void invalidObservabilityTargets;

type Equal<T, U> =
	(<V>() => V extends T ? 1 : 2) extends <V>() => V extends U ? 1 : 2
		? true
		: false;
type Assert<T extends true> = T;

export type ObjectContainerTypeTest = Assert<
	Equal<UnwrapConfig<typeof objectContainer>["type"], "container">
>;
export type FactoryContainerExportTest = Assert<
	typeof factoryContainer extends ContainerConfigExport ? true : false
>;
export type PromisedContainerExportTest = Assert<
	typeof promisedContainer extends ContainerConfigExport ? true : false
>;
export type DurableObjectContainerExportTest = Assert<
	typeof durableObjectContainer extends ContainerConfigExport ? true : false
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
export type DefaultExportTypeTest = Assert<
	Equal<ParsedConfigExports["default"], ParsedInputWorkerConfig | undefined>
>;
