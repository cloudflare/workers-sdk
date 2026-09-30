/** A `cloudflare.config.ts` authored against `cf/config`, the path users import. */
import {
	bindings,
	defineConfig,
	defineContainer,
	defineWorker,
} from "cf/config";
import type {
	InferDurableNamespaces,
	InferEnv,
	InferMainModule,
	UnwrapConfig,
} from "cf/config";

const worker = defineWorker((ctx) => ({
	name: "worker",
	compatibilityDate: "2026-09-29",
	env: { MODE: bindings.text(`${ctx.mode}`) },
}));

const container = defineContainer({
	name: "container",
	image: { dockerfile: "./Dockerfile" },
});

const config = defineConfig({ worker, containers: [container] });
export default config;

// The type expressions `generateTypes()` writes to `.cloudflare/types/index.d.ts`.
type WorkerConfig = UnwrapConfig<UnwrapConfig<typeof config>["worker"]>;
export type Env = InferEnv<WorkerConfig>;
export type MainModule = InferMainModule<WorkerConfig>;
export type DurableNamespaces = InferDurableNamespaces<WorkerConfig>;
