import { DurableObject, WorkerEntrypoint } from "cloudflare:workers";
import { bindings } from "../bindings";
import { exports as workerExports } from "../exports";
import { defineWorker } from "../worker-definition";
import type { DurableObjectBinding, WorkerBinding } from "../bindings";
import type { InferEnv, UnwrapConfig } from "../inference";

class Admin extends WorkerEntrypoint {
	adminMethod(): string {
		return "admin";
	}
}

class Counter extends DurableObject {
	increment(): number {
		return 1;
	}
}

const entrypoint = {
	default: { fetch: () => new Response() },
	Admin,
	Counter,
};

const auxiliary = defineWorker({
	name: "auxiliary",
	compatibilityDate: "2026-09-02",
	entrypoint,
	exports: {
		Counter: workerExports.durableObject({ storage: "sqlite" }),
	},
});

const auxiliaryFactory = defineWorker(() => ({
	name: "auxiliary-factory",
	compatibilityDate: "2026-09-02",
	entrypoint,
	/*
	 * Deliberately omit `exports`: `entrypoint` alone provides enough
	 * information to infer WorkerEntrypoint service bindings.
	 */
}));

const config = defineWorker({
	name: "entry",
	compatibilityDate: "2026-09-02",
	env: {
		ADMIN: bindings.worker({ worker: auxiliary, exportName: "Admin" }),
		DEFAULT: bindings.worker({ worker: auxiliary }),
		FACTORY_ADMIN: bindings.worker({
			worker: auxiliaryFactory,
			exportName: "Admin",
		}),
		COUNTER: bindings.durableObject({
			worker: auxiliary,
			exportName: "Counter",
		}),
		DIRECT_ADMIN: {
			type: "worker",
			worker: auxiliary,
			exportName: "Admin",
		},
		EXTERNAL: bindings.worker({
			worker: "external-worker",
			exportName: "AnyEntrypoint",
		}),
	},
});

bindings.worker({
	worker: auxiliary,
	// @ts-expect-error Only WorkerEntrypoint exports are accepted.
	exportName: "Counter",
});

bindings.durableObject({
	worker: auxiliary,
	// @ts-expect-error Only configured Durable Object exports are accepted.
	exportName: "Admin",
});

type Equal<T, U> =
	(<V>() => V extends T ? 1 : 2) extends <V>() => V extends U ? 1 : 2
		? true
		: false;
type Assert<T extends true> = T;
type Env = InferEnv<UnwrapConfig<typeof config>>;
type Auxiliary = typeof auxiliary;

export type WorkerExportNameTest = Assert<
	Equal<WorkerBinding<Auxiliary>["exportName"], "Admin" | undefined>
>;
export type DurableObjectExportNameTest = Assert<
	Equal<DurableObjectBinding<Auxiliary>["exportName"], "Counter">
>;
// @ts-expect-error Worker binding export names come from the referenced Worker.
export type InvalidWorkerExportNameTest = WorkerBinding<Auxiliary, "Counter">;
// @ts-expect-error Durable Object export names come from the referenced Worker.
export type InvalidDoExportNameTest = DurableObjectBinding<Auxiliary, "Admin">;
export type AdminBindingTest = Assert<Equal<Env["ADMIN"], Fetcher<Admin>>>;
export type DefaultBindingTest = Assert<Equal<Env["DEFAULT"], Fetcher>>;
export type FactoryAdminBindingTest = Assert<
	Equal<Env["FACTORY_ADMIN"], Fetcher<Admin>>
>;
export type DirectAdminBindingTest = Assert<
	Equal<Env["DIRECT_ADMIN"], Fetcher<Admin>>
>;
export type CounterBindingTest = Assert<
	Equal<Env["COUNTER"], DurableObjectNamespace<Counter>>
>;
export type ExternalBindingTest = Assert<Equal<Env["EXTERNAL"], Fetcher>>;
