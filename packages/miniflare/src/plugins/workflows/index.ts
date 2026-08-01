import fs from "node:fs/promises";
import SCRIPT_WORKFLOWS_BINDING from "worker:workflows/binding";
import SCRIPT_WORKFLOWS_WRAPPED_BINDING from "worker:workflows/wrapped-binding";
import {
	getUserServiceName,
	OBSERVABILITY_COLLECTOR_SERVICE_NAME,
	OBSERVABILITY_COMPAT_FLAGS,
} from "../core";
import {
	getEnvBindingsOfType,
	getExportsOfType,
	getPersistPath,
	getRemoteProxyConnectionString,
	getUserBindingServiceName,
	ProxyNodeBinding,
	SERVICE_DEV_REGISTRY_PROXY,
} from "../shared";
import type { ParsedWorkerOptions } from "../../config/schema";
import type { Service } from "../../runtime";
import type { Plugin, RemoteProxyConnectionString } from "../shared";

export const WORKFLOWS_PLUGIN_NAME = "workflows";
export const WORKFLOWS_STORAGE_SERVICE_NAME = `${WORKFLOWS_PLUGIN_NAME}:storage`;

interface WorkflowEntry {
	name: string;
	className: string;
	scriptName: string;
	// When true, the workflow's `scriptName` refers to a worker that lives
	// outside this Miniflare instance (registered in the wrangler dev registry).
	// The engine's USER_WORKFLOW binding is rerouted through the
	// dev-registry-proxy so calls reach the external worker.
	external: boolean;
	remoteProxyConnectionString?: RemoteProxyConnectionString;
	stepLimit?: number;
	compatibilityFlags?: string[];
}

/**
 * Reconstructs the per-workflow definitions from the parsed config. The binding
 * (`config.env`, type `workflow`) provides `name`, `workerName`, `exportName`;
 * step limits and compatibility flags come from the defining worker, so they're
 * only available when the workflow is defined by this worker (the common case —
 * external workflows carry neither, mirroring wrangler's constraints).
 */
function workflowEntries(
	options: ParsedWorkerOptions,
	workerNames: string[]
): [bindingName: string, workflow: WorkflowEntry][] {
	return getEnvBindingsOfType(options.config, "workflow").map(
		([bindingName, binding]) => {
			const external = !workerNames.includes(binding.workerName);
			const isLocallyDefined = binding.workerName === options.config.name;
			const workflowExport = isLocallyDefined
				? getExportsOfType(options.config, "workflow").find(
						([className]) => className === binding.exportName
					)?.[1]
				: undefined;
			return [
				bindingName,
				{
					name: binding.name,
					className: binding.exportName,
					scriptName: binding.workerName,
					external,
					remoteProxyConnectionString: getRemoteProxyConnectionString(
						binding,
						options.dev
					),
					stepLimit: workflowExport?.limits?.steps,
					compatibilityFlags: isLocallyDefined
						? options.config.compatibilityFlags
						: undefined,
				},
			];
		}
	);
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
								name: getUserBindingServiceName(
									WORKFLOWS_PLUGIN_NAME,
									binding.name,
									getRemoteProxyConnectionString(binding, options.dev)
								),
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

	async getServices({ options, tmpPath, sharedOptions, workerNames }) {
		const workflows = workflowEntries(options, workerNames);
		if (workflows.length === 0) {
			return [];
		}

		const persistPath = getPersistPath(
			WORKFLOWS_PLUGIN_NAME,
			tmpPath,
			sharedOptions.resourcePersistencePath
		);
		await fs.mkdir(persistPath, { recursive: true });
		// each workflow should get its own storage service
		const storageServices: Service[] = workflows.map<Service>(
			([_, workflow]) => ({
				name: `${WORKFLOWS_STORAGE_SERVICE_NAME}-${workflow.name}`,
				disk: { path: persistPath, writable: true },
			})
		);

		// The engine service is built here, not through the core plugin's
		// per-user-worker path, so tail it explicitly or workflow invocations are
		// invisible in the Local Explorer.
		const observabilityEnabled = sharedOptions.unsafeObservability === true;

		// this creates one miniflare service per workflow that the user's script has. we should dedupe engine definition later
		const services = workflows.map<Service>(([bindingName, workflow]) => {
			// NOTE(lduarte): the engine unique namespace key must be unique per workflow definition
			// otherwise workerd will crash because there's two equal DO namespaces
			const uniqueKey = `miniflare-workflows-${workflow.name}`;

			const engineCompatibilityFlags = [
				"experimental",
				...(workflow.compatibilityFlags ?? []),
			];
			// Mirrors core's designator shape (prefixed name, JSON props);
			// attributes the engine's invocations to the workflow.
			const streamingTails = observabilityEnabled
				? [
						{
							name: getUserServiceName(OBSERVABILITY_COLLECTOR_SERVICE_NAME),
							props: { json: JSON.stringify({ worker: workflow.name }) },
						},
					]
				: undefined;
			if (observabilityEnabled) {
				engineCompatibilityFlags.push(
					...OBSERVABILITY_COMPAT_FLAGS.filter(
						(flag) => !engineCompatibilityFlags.includes(flag)
					)
				);
			}

			const workflowsBinding: Service = {
				name: getUserBindingServiceName(
					WORKFLOWS_PLUGIN_NAME,
					workflow.name,
					workflow.remoteProxyConnectionString
				),
				worker: {
					compatibilityDate: "2024-10-22",
					compatibilityFlags: Array.from(new Set(engineCompatibilityFlags)),
					...(streamingTails ? { streamingTails } : {}),
					modules: [
						{
							name: "workflows.mjs",
							esModule: SCRIPT_WORKFLOWS_BINDING(),
						},
					],
					durableObjectNamespaces: [
						{
							className: "Engine",
							enableSql: true,
							uniqueKey,
							preventEviction: true,
						},
					],
					durableObjectStorage: {
						localDisk: `${WORKFLOWS_STORAGE_SERVICE_NAME}-${workflow.name}`,
					},
					bindings: [
						{
							name: "ENGINE",
							durableObjectNamespace: { className: "Engine" },
						},
						workflow.external && workflow.scriptName
							? {
									name: "USER_WORKFLOW",
									service: {
										name: getUserServiceName(SERVICE_DEV_REGISTRY_PROXY),
										entrypoint: "ExternalServiceProxy",
										props: {
											json: JSON.stringify({
												service: workflow.scriptName,
												entrypoint: workflow.className,
											}),
										},
									},
								}
							: {
									name: "USER_WORKFLOW",
									service: {
										name: getUserServiceName(workflow.scriptName),
										entrypoint: workflow.className,
									},
								},
						{
							name: "BINDING_NAME",
							json: JSON.stringify(bindingName),
						},
						{
							name: "WORKFLOW_NAME",
							json: JSON.stringify(workflow.name),
						},
						...(workflow.stepLimit !== undefined
							? [
									{
										name: "STEP_LIMIT",
										json: JSON.stringify(workflow.stepLimit),
									},
								]
							: []),
					],
				},
			};

			return workflowsBinding;
		});

		return [...storageServices, ...services];
	},
};
