import {
	DurableObject,
	WorkerEntrypoint,
	WorkflowEntrypoint,
} from "cloudflare:workers";
import { bindings } from "../bindings";
import { defineWorker } from "../definition";
import { exports as workerExports } from "../exports";
import type {
	DurableObjectBinding,
	WorkerBinding,
	WorkflowBinding,
} from "../bindings";
import type { InferEnv, UnwrapConfig } from "../inference";
import type { WorkflowEvent, WorkflowStep } from "cloudflare:workers";

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

// A Durable Object binding without `worker` refers to this Worker's own class.
const selfConfig = defineWorker({
	name: "self",
	compatibilityDate: "2026-09-02",
	entrypoint,
	exports: {
		Counter: workerExports.durableObject({ storage: "sqlite" }),
	},
	env: {
		SELF_COUNTER: bindings.durableObject({ exportName: "Counter" }),
		DIRECT_SELF_COUNTER: { type: "durable-object", exportName: "Counter" },
		UNTYPED_SELF: bindings.durableObject({ exportName: "NotAClass" }),
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

type SelfEnv = InferEnv<UnwrapConfig<typeof selfConfig>>;
export type SelfCounterBindingTest = Assert<
	Equal<SelfEnv["SELF_COUNTER"], DurableObjectNamespace<Counter>>
>;
export type DirectSelfCounterBindingTest = Assert<
	Equal<SelfEnv["DIRECT_SELF_COUNTER"], DurableObjectNamespace<Counter>>
>;
export type UntypedSelfBindingTest = Assert<
	Equal<SelfEnv["UNTYPED_SELF"], DurableObjectNamespace>
>;
export type SelfBindingShapeTest = Assert<
	Equal<
		ReturnType<typeof bindings.durableObject<undefined, "Counter">>,
		DurableObjectBinding<undefined, "Counter">
	>
>;
export type SelfBindingWorkerTest = Assert<
	Equal<DurableObjectBinding<undefined, "Counter">["worker"], undefined>
>;

// Workflow bindings are disabled in `cloudflare.config.ts` for now, but their
// public types follow the same rule: no `worker` means this Worker.
class Pipeline extends WorkflowEntrypoint<unknown, { id: string }> {
	override async run(
		_event: WorkflowEvent<{ id: string }>,
		_step: WorkflowStep
	) {}
}
type SelfWorkflowEnv = InferEnv<{
	entrypoint: { default: { fetch: () => Response }; Pipeline: typeof Pipeline };
	env: { PIPELINE: WorkflowBinding<undefined, "Pipeline"> };
}>;
export type SelfWorkflowBindingTest = Assert<
	Equal<SelfWorkflowEnv["PIPELINE"], Workflow<Readonly<{ id: string }>>>
>;
export type SelfWorkflowWorkerTest = Assert<
	Equal<WorkflowBinding<undefined, "Pipeline">["worker"], undefined>
>;
export type ExternalWorkflowWorkerTest = Assert<
	Equal<WorkflowBinding<"other", string>["worker"], "other">
>;
