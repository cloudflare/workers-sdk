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
	getPersistPath,
	getUserBindingServiceName,
	ProxyNodeBinding,
	SERVICE_DEV_REGISTRY_PROXY,
	WORKER_BINDING_SERVICE_LOOPBACK,
} from "../shared";
import type { Service } from "../../runtime";
import type { Plugin } from "../shared";

export const WORKFLOWS_PLUGIN_NAME = "workflows";
export const WORKFLOWS_STORAGE_SERVICE_NAME = `${WORKFLOWS_PLUGIN_NAME}:storage`;

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
									binding.name
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
		const workflows = getEnvBindingsOfType(options.config, "workflow");
		if (workflows.length === 0) {
			return [];
		}

		const persistPath = getPersistPath(
			WORKFLOWS_PLUGIN_NAME,
			tmpPath,
			sharedOptions.isolatedResourcePersistencePath
		);
		await fs.mkdir(persistPath, { recursive: true });
		// each workflow should get its own storage service
		const storageServices: Service[] = workflows.map<Service>(
			([_, binding]) => ({
				name: `${WORKFLOWS_STORAGE_SERVICE_NAME}-${binding.name}`,
				disk: { path: persistPath, writable: true },
			})
		);

		// The engine service is built here, not through the core plugin's
		// per-user-worker path, so tail it explicitly or workflow invocations are
		// invisible in the Local Explorer.
		const observabilityEnabled = sharedOptions.unsafeObservability === true;

		// this creates one miniflare service per workflow that the user's script has. we should dedupe engine definition later
		const services = workflows.map<Service>(([bindingName, binding]) => {
			const external = !workerNames.includes(binding.workerName);
			const stepLimit = binding.limits?.steps;
			// NOTE(lduarte): the engine unique namespace key must be unique per workflow definition
			// otherwise workerd will crash because there's two equal DO namespaces
			const uniqueKey = `miniflare-workflows-${binding.name}`;

			const engineCompatibilityFlags = [
				"experimental",
				...(options.config.compatibilityFlags ?? []),
			];
			// Mirrors core's designator shape (prefixed name, JSON props);
			// attributes the engine's invocations to the workflow.
			const streamingTails = observabilityEnabled
				? [
						{
							name: getUserServiceName(OBSERVABILITY_COLLECTOR_SERVICE_NAME),
							props: { json: JSON.stringify({ worker: binding.name }) },
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
				name: getUserBindingServiceName(WORKFLOWS_PLUGIN_NAME, binding.name),
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
												service: binding.workerName,
												entrypoint: binding.exportName,
											}),
										},
									},
								}
							: {
									name: "USER_WORKFLOW",
									service: {
										name: getUserServiceName(binding.workerName),
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

		return [...storageServices, ...services];
	},
};
