import fs from "node:fs/promises";
import SCRIPT_WORKFLOWS_BINDING from "worker:workflows/binding";
import SCRIPT_WORKFLOWS_WRAPPED_BINDING from "worker:workflows/wrapped-binding";
import { MiniflareCoreError } from "../../shared";
import {
	getUserServiceName,
	OBSERVABILITY_COLLECTOR_SERVICE_NAME,
	OBSERVABILITY_COMPAT_FLAGS,
} from "../core";
import {
	getEnvBindingsOfType,
	getExportsOfType,
	getPersistPath,
	getUserBindingServiceName,
	ProxyNodeBinding,
	SERVICE_DEV_REGISTRY_PROXY,
	WORKER_BINDING_SERVICE_LOOPBACK,
} from "../shared";
import type { Service, ServiceDesignator } from "../../runtime";
import type { ParsedWorkerOptions, Plugin, WorkflowExporters } from "../shared";

export const WORKFLOWS_PLUGIN_NAME = "workflows";
export const WORKFLOWS_STORAGE_SERVICE_NAME = `${WORKFLOWS_PLUGIN_NAME}:storage`;

/** Service implementing the Workflow API for `env` and `ctx.exports`. */
export function getWorkflowBindingServiceName(workflowName: string) {
	return getUserBindingServiceName(WORKFLOWS_PLUGIN_NAME, workflowName);
}

/** Service running the Workflows a Worker declares in `exports`. */
export function getWorkflowsEngineServiceName(workerName: string) {
	// Workflow names can't contain `:`, so this can't clash with a binding service.
	return `${WORKFLOWS_PLUGIN_NAME}:engine:${workerName}`;
}

/**
 * Unique key of a Workflow's Engine Durable Object namespace. It must be unique
 * per Workflow, or workerd crashes on two equal namespaces. workerd derives the
 * same key for a Workflow on `ctx.exports`, so a Workflow keeps its instances
 * whether it's run as a binding or as an export.
 */
export function getWorkflowNamespaceKey(workflowName: string) {
	return `miniflare-workflows-${workflowName}`;
}

/**
 * Collects the Workflows declared in the `exports` of every Worker in this
 * instance. An exported Workflow is run by its Worker, so every binding to it
 * must refer to that Worker and class.
 *
 * @param allWorkerOpts - Options of every Worker in this instance
 * @returns The Worker, class and step limit of each exported Workflow
 * @throws {MiniflareCoreError} If two Workers export the same Workflow, or a
 * binding to an exported Workflow refers to a different Worker or class
 */
export function getWorkflowExporters(
	allWorkerOpts: ParsedWorkerOptions[]
): WorkflowExporters {
	const exporters: WorkflowExporters = new Map();
	for (const { config } of allWorkerOpts) {
		for (const [className, workflow] of getExportsOfType(config, "workflow")) {
			const existing = exporters.get(workflow.name);
			if (existing !== undefined) {
				throw new MiniflareCoreError(
					"ERR_VALIDATION",
					`Workflow "${workflow.name}" is exported as "${existing.className}" by Worker "${existing.workerName}" and as "${className}" by Worker "${config.name}". Workflow names must be unique.`
				);
			}
			exporters.set(workflow.name, {
				workerName: config.name,
				className,
				stepLimit: workflow.limits?.steps,
			});
		}
	}

	for (const { config } of allWorkerOpts) {
		for (const [bindingName, binding] of getEnvBindingsOfType(
			config,
			"workflow"
		)) {
			const exporter = exporters.get(binding.name);
			if (exporter === undefined) {
				continue;
			}
			if (
				binding.worker !== exporter.workerName ||
				binding.exportName !== exporter.className
			) {
				throw new MiniflareCoreError(
					"ERR_VALIDATION",
					`Workflow binding "${bindingName}" of Worker "${config.name}" refers to class "${binding.exportName}" of Worker "${binding.worker}", but Workflow "${binding.name}" is exported as "${exporter.className}" by Worker "${exporter.workerName}".`
				);
			}
			// Deploy merges the settings of a Worker's own binding into its export,
			// with the binding taking precedence.
			if (
				binding.worker === config.name &&
				binding.limits?.steps !== undefined
			) {
				exporter.stepLimit = binding.limits.steps;
			}
		}
	}

	return exporters;
}

export const WORKFLOWS_PLUGIN: Plugin = {
	bindingTypeDescription: "Workflow",
	getBindings(options) {
		return getEnvBindingsOfType(options.config, "workflow").map(
			([bindingName, binding]) => ({
				name: bindingName,
				wrapped: {
					moduleName: `${WORKFLOWS_PLUGIN_NAME}:local-wrapped-binding`,
					innerBindings: [
						{
							name: "binding",
							service: {
								name: getWorkflowBindingServiceName(binding.name),
								entrypoint: "WorkflowBinding",
							},
						},
					],
				},
			})
		);
	},

	getNodeBindings(options) {
		return Object.fromEntries(
			getEnvBindingsOfType(options.config, "workflow").map(([bindingName]) => [
				bindingName,
				new ProxyNodeBinding(),
			])
		);
	},

	getExtensions() {
		return [
			{
				modules: [
					{
						name: `${WORKFLOWS_PLUGIN_NAME}:local-wrapped-binding`,
						esModule: SCRIPT_WORKFLOWS_WRAPPED_BINDING(),
						internal: true,
					},
				],
			},
		];
	},

	async getServices({
		options,
		tmpPath,
		sharedOptions,
		workerNames,
		workflowExporters,
	}) {
		const { config } = options;
		// Bindings to an exported Workflow use the services of the Worker that
		// exports it, defined below.
		const workflows = getEnvBindingsOfType(config, "workflow").filter(
			([, binding]) => !workflowExporters.has(binding.name)
		);
		const exportedWorkflows = getExportsOfType(config, "workflow");
		if (workflows.length === 0 && exportedWorkflows.length === 0) {
			return [];
		}

		const persistPath = getPersistPath(
			WORKFLOWS_PLUGIN_NAME,
			tmpPath,
			sharedOptions.isolatedResourcePersistencePath
		);
		await fs.mkdir(persistPath, { recursive: true });
		// each workflow should get its own storage service
		const storageServices: Service[] = [
			...workflows.map(([, binding]) => binding.name),
			...exportedWorkflows.map(([, workflow]) => workflow.name),
		].map<Service>((workflowName) => ({
			name: `${WORKFLOWS_STORAGE_SERVICE_NAME}-${workflowName}`,
			disk: { path: persistPath, writable: true },
		}));

		// The engine service is built here, not through the core plugin's
		// per-user-worker path, so tail it explicitly or workflow invocations are
		// invisible in the Local Explorer.
		const observabilityEnabled = sharedOptions.unsafeObservability === true;
		const engineCompatibilityFlags = [
			"experimental",
			...(config.compatibilityFlags ?? []),
		];
		if (observabilityEnabled) {
			engineCompatibilityFlags.push(
				...OBSERVABILITY_COMPAT_FLAGS.filter(
					(flag) => !engineCompatibilityFlags.includes(flag)
				)
			);
		}
		// Mirrors core's designator shape (prefixed name, JSON props); `worker`
		// is the name invocations are attributed to.
		const getStreamingTails = (
			worker: string
		): { streamingTails?: ServiceDesignator[] } =>
			observabilityEnabled
				? {
						streamingTails: [
							{
								name: getUserServiceName(OBSERVABILITY_COLLECTOR_SERVICE_NAME),
								props: { json: JSON.stringify({ worker }) },
							},
						],
					}
				: {};
		const engineWorker = {
			compatibilityDate: "2024-10-22",
			compatibilityFlags: Array.from(new Set(engineCompatibilityFlags)),
			modules: [
				{
					name: "workflows.mjs",
					esModule: SCRIPT_WORKFLOWS_BINDING(),
				},
			],
		};

		// this creates one miniflare service per workflow that the user's script has. we should dedupe engine definition later
		const services = workflows.map<Service>(([bindingName, binding]) => {
			const external = !workerNames.includes(binding.worker);
			const stepLimit = binding.limits?.steps;

			const workflowsBinding: Service = {
				name: getWorkflowBindingServiceName(binding.name),
				worker: {
					...engineWorker,
					...getStreamingTails(binding.name),
					durableObjectNamespaces: [
						{
							className: "Engine",
							enableSql: true,
							uniqueKey: getWorkflowNamespaceKey(binding.name),
							preventEviction: true,
						},
					],
					durableObjectStorage: {
						localDisk: `${WORKFLOWS_STORAGE_SERVICE_NAME}-${binding.name}`,
					},
					bindings: [
						{
							name: "ENGINE",
							durableObjectNamespace: { className: "Engine" },
						},
						external
							? {
									name: "USER_WORKFLOW",
									service: {
										name: getUserServiceName(SERVICE_DEV_REGISTRY_PROXY),
										entrypoint: "ExternalServiceProxy",
										props: {
											json: JSON.stringify({
												service: binding.worker,
												entrypoint: binding.exportName,
											}),
										},
									},
								}
							: {
									name: "USER_WORKFLOW",
									service: {
										name: getUserServiceName(binding.worker),
										entrypoint: binding.exportName,
									},
								},
						{
							name: "BINDING_NAME",
							json: JSON.stringify(bindingName),
						},
						{
							name: "WORKFLOW_NAME",
							json: JSON.stringify(binding.name),
						},
						// Workflow deletion needs the Node.js host to remove its SQLite files.
						WORKER_BINDING_SERVICE_LOOPBACK,
						...(stepLimit !== undefined
							? [
									{
										name: "STEP_LIMIT",
										json: JSON.stringify(stepLimit),
									},
								]
							: []),
					],
				},
			};

			return workflowsBinding;
		});

		if (exportedWorkflows.length === 0) {
			return [...storageServices, ...services];
		}

		// workerd runs exported Workflows in the exporting Worker: it creates each
		// Workflow's Engine namespace there, runs the Engine class of the service
		// below with the Workflow's class and name as props, and stores its
		// instances through the Workflow's binding service.
		const stepLimits: Record<string, number> = {};
		for (const [, workflow] of exportedWorkflows) {
			const stepLimit = workflowExporters.get(workflow.name)?.stepLimit;
			if (stepLimit !== undefined) {
				stepLimits[workflow.name] = stepLimit;
			}
		}
		const engineService: Service = {
			name: getWorkflowsEngineServiceName(config.name),
			worker: {
				...engineWorker,
				...getStreamingTails(config.name),
				bindings: [
					WORKER_BINDING_SERVICE_LOOPBACK,
					{ name: "STEP_LIMITS", json: JSON.stringify(stepLimits) },
				],
			},
		};
		const exportedBindingServices = exportedWorkflows.map<Service>(
			([className, workflow]) => ({
				name: getWorkflowBindingServiceName(workflow.name),
				worker: {
					...engineWorker,
					...getStreamingTails(workflow.name),
					durableObjectStorage: {
						localDisk: `${WORKFLOWS_STORAGE_SERVICE_NAME}-${workflow.name}`,
					},
					bindings: [
						{
							name: "ENGINE",
							durableObjectNamespace: {
								className: getWorkflowNamespaceKey(workflow.name),
								serviceName: getUserServiceName(config.name),
							},
						},
						{ name: "BINDING_NAME", json: JSON.stringify(className) },
						{ name: "WORKFLOW_NAME", json: JSON.stringify(workflow.name) },
						WORKER_BINDING_SERVICE_LOOPBACK,
					],
				},
			})
		);

		return [
			...storageServices,
			...services,
			engineService,
			...exportedBindingServices,
		];
	},
};
