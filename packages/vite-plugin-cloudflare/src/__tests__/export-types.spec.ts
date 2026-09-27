import { describe, test } from "vitest";
import { getInitialWorkerNameToExportTypesMap } from "../export-types";
import type { Worker, WorkersResolvedConfig } from "../plugin-config";

function createWorker(
	name: string,
	config: Partial<Worker["config"]> = {}
): Worker {
	return {
		config: {
			name,
			entrypoint: `./${name}.ts`,
			compatibilityDate: "2026-09-27",
			...config,
		},
		directoryName: name,
		nodeJsCompat: undefined,
		devOnly: undefined,
	};
}

function createResolvedConfig(workers: Worker[]): WorkersResolvedConfig {
	return {
		environmentNameToWorkerMap: new Map(
			workers.map((worker) => [worker.config.name, worker])
		),
	} as unknown as WorkersResolvedConfig;
}

describe("initial Worker export types", () => {
	test("classifies WorkerEntrypoints from exports and bindings", ({
		expect,
	}) => {
		const resolvedConfig = createResolvedConfig([
			createWorker("entry", {
				exports: {
					ConfiguredEntrypoint: { type: "worker" },
				},
				env: {
					BOUND_ENTRYPOINT: {
						type: "worker",
						worker: "auxiliary",
						exportName: "BoundEntrypoint",
					},
					DEFAULT_ENTRYPOINT: {
						type: "worker",
						worker: "auxiliary",
					},
				},
			}),
			createWorker("auxiliary"),
		]);

		expect(getInitialWorkerNameToExportTypesMap(resolvedConfig)).toEqual(
			new Map([
				["entry", { ConfiguredEntrypoint: "WorkerEntrypoint" }],
				["auxiliary", { BoundEntrypoint: "WorkerEntrypoint" }],
			])
		);
	});

	test("classifies only live Durable Object exports", ({ expect }) => {
		const resolvedConfig = createResolvedConfig([
			createWorker("entry", {
				exports: {
					ImplicitlyCreated: {
						type: "durable-object",
						storage: "sqlite",
					},
					ExplicitlyCreated: {
						type: "durable-object",
						state: "created",
						storage: "legacy-kv",
					},
					IncomingTransfer: {
						type: "durable-object",
						state: "expecting-transfer",
						storage: "sqlite",
						transferFrom: "source",
					},
					Deleted: { type: "durable-object", state: "deleted" },
					Renamed: {
						type: "durable-object",
						state: "renamed",
						renamedTo: "ImplicitlyCreated",
					},
					Transferred: {
						type: "durable-object",
						state: "transferred",
						transferredTo: "target",
					},
				},
			}),
		]);

		expect(getInitialWorkerNameToExportTypesMap(resolvedConfig)).toEqual(
			new Map([
				[
					"entry",
					{
						ImplicitlyCreated: "DurableObject",
						ExplicitlyCreated: "DurableObject",
						IncomingTransfer: "DurableObject",
					},
				],
			])
		);
	});

	test("classifies storage-less Durable Objects from bindings", ({
		expect,
	}) => {
		const resolvedConfig = createResolvedConfig([
			createWorker("caller", {
				env: {
					SAME_WORKER_OBJECT: {
						type: "durable-object",
						worker: "caller",
						exportName: "SameWorkerObject",
					},
					CROSS_WORKER_OBJECT: {
						type: "durable-object",
						worker: "target",
						exportName: "CrossWorkerObject",
					},
				},
			}),
			createWorker("target"),
		]);

		expect(getInitialWorkerNameToExportTypesMap(resolvedConfig)).toEqual(
			new Map([
				["caller", { SameWorkerObject: "DurableObject" }],
				["target", { CrossWorkerObject: "DurableObject" }],
			])
		);
	});

	test("classifies Workflow exports on entry and auxiliary Workers", ({
		expect,
	}) => {
		const resolvedConfig = createResolvedConfig([
			createWorker("entry", {
				exports: {
					EntryWorkflow: { type: "workflow", name: "entry-workflow" },
				},
			}),
			createWorker("auxiliary", {
				exports: {
					AuxiliaryWorkflow: {
						type: "workflow",
						name: "auxiliary-workflow",
					},
				},
			}),
		]);

		expect(getInitialWorkerNameToExportTypesMap(resolvedConfig)).toEqual(
			new Map([
				["entry", { EntryWorkflow: "WorkflowEntrypoint" }],
				["auxiliary", { AuxiliaryWorkflow: "WorkflowEntrypoint" }],
			])
		);
	});

	test("classifies Workflow entrypoints from bindings", ({ expect }) => {
		const resolvedConfig = createResolvedConfig([
			createWorker("caller", {
				env: {
					SAME_WORKER_WORKFLOW: {
						type: "workflow",
						name: "same-worker-workflow",
						worker: "caller",
						exportName: "SameWorkerWorkflow",
					},
					CROSS_WORKER_WORKFLOW: {
						type: "workflow",
						name: "cross-worker-workflow",
						worker: "target",
						exportName: "CrossWorkerWorkflow",
					},
				},
			}),
			createWorker("target"),
		]);

		expect(getInitialWorkerNameToExportTypesMap(resolvedConfig)).toEqual(
			new Map([
				["caller", { SameWorkerWorkflow: "WorkflowEntrypoint" }],
				["target", { CrossWorkerWorkflow: "WorkflowEntrypoint" }],
			])
		);
	});
});
