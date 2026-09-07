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
	compatibilityDate: "2026-06-24",
	image: { dockerfile: "./Dockerfile", buildVars: { NODE_VERSION: "24" } },
});

const factoryContainer = defineContainer((ctx) => ({
	name: `factory-container-${ctx.mode}`,
	compatibilityDate: "2026-06-24",
	image: { reference: "registry.example.com/container:latest" },
}));

const promisedContainer = defineContainer(
	Promise.resolve({
		name: "promised-container",
		compatibilityDate: "2026-06-24",
		image: { dockerfile: "./Dockerfile" },
	})
);

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
	},
});

workerExports.durableObject({
	storage: "legacy-kv",
	// @ts-expect-error Containers require SQLite Durable Object storage.
	container: objectContainer,
});

const invalidContainer: ContainerConfigInput = {
	name: "invalid",
	compatibilityDate: "2026-06-24",
	image: { dockerfile: "./Dockerfile" },
	// @ts-expect-error Deprecated Container fields are not accepted.
	className: "ContainerDO",
};
void invalidContainer;

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
