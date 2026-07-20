import fs from "node:fs/promises";
import path from "node:path";
import SCRIPT_WORKFLOWS_BINDING from "worker:workflows/binding";
import SCRIPT_WORKFLOWS_SAFFRON from "worker:workflows/saffron";
import SCRIPT_WORKFLOWS_WRAPPED_BINDING from "worker:workflows/wrapped-binding";
import { z } from "zod";
import { getUserServiceName } from "../core";
import {
	getPersistPath,
	getUserBindingServiceName,
	PersistenceSchema,
	ProxyNodeBinding,
	SERVICE_DEV_REGISTRY_PROXY,
} from "../shared";
import type { Service } from "../../runtime";
import type { Plugin, RemoteProxyConnectionString } from "../shared";

export const WorkflowsOptionsSchema = z.object({
	workflows: z
		.record(
			z.object({
				name: z.string(),
				className: z.string(),
				scriptName: z.string().optional(),
				// When set, the workflow's `scriptName` refers to a worker that lives
				// outside this Miniflare instance (registered in the wrangler dev
				// registry). The engine's USER_WORKFLOW binding is rerouted through
				// the dev-registry-proxy so calls reach the external worker. Set by
				// `getExternalServiceEntrypoints` in `src/index.ts`; not part of the
				// public API.
				external: z.boolean().optional(),
				remoteProxyConnectionString: z
					.custom<RemoteProxyConnectionString>()
					.optional(),
				stepLimit: z.number().int().min(1).optional(),
				compatibilityFlags: z.string().array().optional(),
				schedules: z.string().array().optional(),
			})
		)
		.optional(),
});
export const WorkflowsSharedOptionsSchema = z.object({
	workflowsPersist: PersistenceSchema,
});

export const WORKFLOWS_PLUGIN_NAME = "workflows";
export const WORKFLOWS_STORAGE_SERVICE_NAME = `${WORKFLOWS_PLUGIN_NAME}:storage`;
export const WORKFLOWS_SAFFRON_SERVICE_NAME = `${WORKFLOWS_PLUGIN_NAME}:saffron`;

// The vendored saffron wasm is static, so read it once and reuse across config
// reloads. A watch-mode rebuild of the wasm isn't picked up until the dev process
// restarts, which is fine since it effectively never changes.
let saffronWasm: Buffer | undefined;

export const WORKFLOWS_PLUGIN: Plugin<
	typeof WorkflowsOptionsSchema,
	typeof WorkflowsSharedOptionsSchema
> = {
	options: WorkflowsOptionsSchema,
	sharedOptions: WorkflowsSharedOptionsSchema,
	bindingTypeDescription: "Workflow",
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
						compatibilityFlags: Array.from(
							new Set(["experimental", ...(workflow.compatibilityFlags ?? [])])
						),
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
							{
								name: "SAFFRON",
								service: {
									name: WORKFLOWS_SAFFRON_SERVICE_NAME,
									entrypoint: "CronFetcher",
								},
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

		// One shared, stateless saffron service; each engine binds it as SAFFRON.
		// The entry's external `./saffron_bg.wasm` import resolves to the module
		// below; the wasm is shipped to dist by the build (see copySaffron).
		saffronWasm ??= await fs.readFile(
			path.join(__dirname, "../saffron/saffron_bg.wasm")
		);
		const saffronService: Service = {
			name: WORKFLOWS_SAFFRON_SERVICE_NAME,
			worker: {
				compatibilityDate: "2024-10-22",
				compatibilityFlags: ["experimental"],
				modules: [
					{ name: "saffron.mjs", esModule: SCRIPT_WORKFLOWS_SAFFRON() },
					{ name: "saffron_bg.wasm", wasm: saffronWasm },
				],
			},
		};

		return [...storageServices, saffronService, ...services];
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
