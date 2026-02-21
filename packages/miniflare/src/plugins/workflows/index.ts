import fs from "node:fs/promises";
import SCRIPT_WORKFLOWS_BINDING from "worker:workflows/binding";
import SCRIPT_WORKFLOWS_WRAPPED_BINDING from "worker:workflows/wrapped-binding";
import { z } from "zod";
import { Service } from "../../runtime";
import { getUserServiceName } from "../core";
import {
	getPersistPath,
	getUserBindingServiceName,
	PersistenceSchema,
	Plugin,
	ProxyNodeBinding,
	RemoteProxyConnectionString,
} from "../shared";

export const WorkflowsOptionsSchema = z.object({
	workflows: z
		.record(
			z.object({
				name: z.string(),
				className: z.string(),
				scriptName: z.string().optional(),
				remoteProxyConnectionString: z
					.custom<RemoteProxyConnectionString>()
					.optional(),
				stepLimit: z.number().int().min(1).max(100_000).optional(),
			})
		)
		.optional(),
});
export const WorkflowsSharedOptionsSchema = z.object({
	workflowsPersist: PersistenceSchema,
});

export const WORKFLOWS_PLUGIN_NAME = "workflows";
export const WORKFLOWS_STORAGE_SERVICE_NAME = `${WORKFLOWS_PLUGIN_NAME}:storage`;

export const WORKFLOWS_PLUGIN: Plugin<
	typeof WorkflowsOptionsSchema,
	typeof WorkflowsSharedOptionsSchema
> = {
	options: WorkflowsOptionsSchema,
	sharedOptions: WorkflowsSharedOptionsSchema,
	async getBindings(options: z.infer<typeof WorkflowsOptionsSchema>) {
		return Object.entries(options.workflows ?? {}).map(
			([bindingName, workflow]) => ({
				name: bindingName,
				wrapped: {
					moduleName: `${WORKFLOWS_PLUGIN_NAME}:local-wrapped-binding`,
					innerBindings: [
						{
							name: "binding",
							service: {
								name: getUserBindingServiceName(
									WORKFLOWS_PLUGIN_NAME,
									workflow.name,
									workflow.remoteProxyConnectionString
								),
								entrypoint: "WorkflowBinding",
							},
						},
					],
				},
			})
		);
	},

	async getNodeBindings(options) {
		return Object.fromEntries(
			Object.keys(options.workflows ?? {}).map((bindingName) => [
				bindingName,
				new ProxyNodeBinding(),
			])
		);
	},

	getExtensions({}) {
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

	async getServices({ options, sharedOptions, tmpPath, defaultPersistRoot }) {
		const persistPath = getPersistPath(
			WORKFLOWS_PLUGIN_NAME,
			tmpPath,
			defaultPersistRoot,
			sharedOptions.workflowsPersist
		);
		await fs.mkdir(persistPath, { recursive: true });
		// each workflow should get its own storage service
		const storageServices: Service[] = Object.entries(
			options.workflows ?? {}
		).map<Service>(([_, workflow]) => ({
			name: `${WORKFLOWS_STORAGE_SERVICE_NAME}-${workflow.name}`,
			disk: { path: persistPath, writable: true },
		}));

		// this creates one miniflare service per workflow that the user's script has. we should dedupe engine definition later
		const services = Object.entries(options.workflows ?? {}).map<Service>(
			([bindingName, workflow]) => {
				// NOTE(lduarte): the engine unique namespace key must be unique per workflow definition
				// otherwise workerd will crash because there's two equal DO namespaces
				const uniqueKey = `miniflare-workflows-${workflow.name}`;

				const workflowsBinding: Service = {
					name: getUserBindingServiceName(
						WORKFLOWS_PLUGIN_NAME,
						workflow.name,
						workflow.remoteProxyConnectionString
					),
					worker: {
						compatibilityDate: "2024-10-22",
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
							{
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
			}
		);

		if (services.length === 0) {
			return [];
		}

		return [...storageServices, ...services];
	},

	getPersistPath({ workflowsPersist }, tmpPath) {
		return getPersistPath(
			WORKFLOWS_PLUGIN_NAME,
			tmpPath,
			undefined,
			workflowsPersist
		);
	},
};
