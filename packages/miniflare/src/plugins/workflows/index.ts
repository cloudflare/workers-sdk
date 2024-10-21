import fs from "fs/promises";
import SCRIPT_WORKFLOWS_BINDING from "worker:workflows/binding";
import { z } from "zod";
import { Service } from "../../runtime";
import { getUserServiceName } from "../core";
import {
	getPersistPath,
	PersistenceSchema,
	Plugin,
	ProxyNodeBinding,
} from "../shared";

export const WorkflowsOptionsSchema = z.object({
	workflows: z
		.record(
			z.object({
				name: z.string(),
				className: z.string(),
				scriptName: z.string().optional(),
			})
		)
		.optional(),
});
export const WorkflowsSharedOptionsSchema = z.object({
	workflowsPersist: PersistenceSchema,
});

export const WORKFLOWS_PLUGIN_NAME = "workflows";
export const WORKFLOWS_STORAGE_SERVICE_NAME = "workflows";

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
				service: {
					name: `workflows:${workflow.name}`,
					entrypoint: "WorkflowBinding",
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

	async getServices({ options, sharedOptions, tmpPath }) {
		const persistPath = getPersistPath(
			WORKFLOWS_PLUGIN_NAME,
			tmpPath,
			sharedOptions.workflowsPersist
		);
		await fs.mkdir(persistPath, { recursive: true });
		const storageService: Service = {
			name: WORKFLOWS_STORAGE_SERVICE_NAME,
			disk: { path: persistPath, writable: true },
		};

		const services = Object.entries(options.workflows ?? {}).map<Service>(
			([bindingName, workflow]) => {
				const workflowsBinding: Service = {
					name: `workflows:${workflow.name}`,
					worker: {
						compatibilityDate: "2024-10-18",
						modules: [
							{
								name: "workflows.mjs",
								esModule: SCRIPT_WORKFLOWS_BINDING(),
							},
						],
						durableObjectNamespaces: [{ className: "Engine" }],
						durableObjectStorage: { localDisk: WORKFLOWS_STORAGE_SERVICE_NAME },
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
						],
					},
				};

				return workflowsBinding;
			}
		);

		if (services.length === 0) {
			return [];
		}

		return [storageService, ...services];
	},

	getPersistPath({ workflowsPersist }, tmpPath) {
		return getPersistPath(WORKFLOWS_PLUGIN_NAME, tmpPath, workflowsPersist);
	},
};
