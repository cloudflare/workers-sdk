import assert from "node:assert";
import SCRIPT_DO_WRAPPER from "worker:core/do-wrapper";
import SCRIPT_LOCAL_EXPLORER from "worker:local-explorer/explorer";
import {
	kVoid,
	type Service,
	type Worker_Binding,
	type Worker_Module,
} from "../../runtime";
import { CoreBindings } from "../../workers";
import { normaliseDurableObject } from "../do";
import {
	namespaceEntries,
	WORKER_BINDING_SERVICE_LOOPBACK,
	SERVICE_DEV_REGISTRY_PROXY,
} from "../shared";
import {
	getUserServiceName,
	LOCAL_EXPLORER_DISK,
	SERVICE_LOCAL_EXPLORER,
} from "./constants";
import type { PluginWorkerOptions } from "..";
import type { DurableObjectClassNames, WorkflowOption } from "../shared";
import type {
	BindingIdMap,
	ExplorerWorkerOpts,
	WorkerResourceBindings,
	WorkflowBindingInfo,
} from "./types";

export interface ExplorerServicesOptions {
	localExplorerUiPath: string;
	proxyBindings: Worker_Binding[];
	bindingIdMap: BindingIdMap;
	hasDurableObjects: boolean;
	workerNames: string[];
	explorerWorkerOpts: ExplorerWorkerOpts;
	telemetry: {
		enabled: boolean;
		deviceId?: string;
	};
}

/**
 * Creates the services needed for the local explorer feature.
 */
export function getExplorerServices(
	options: ExplorerServicesOptions
): Service[] {
	const {
		localExplorerUiPath,
		proxyBindings,
		bindingIdMap,
		hasDurableObjects,
		workerNames,
		explorerWorkerOpts,
		telemetry,
	} = options;

	const explorerBindings: Worker_Binding[] = [
		// Gives explorer access to all user resource bindings
		...proxyBindings,
		{
			name: CoreBindings.JSON_LOCAL_EXPLORER_BINDING_MAP,
			json: JSON.stringify(bindingIdMap),
		},
		{
			name: CoreBindings.EXPLORER_DISK,
			service: { name: LOCAL_EXPLORER_DISK },
		},
		// Loopback service for accessing Node.js endpoints:
		// - /core/dev-registry for cross-instance aggregation
		// - /core/do-storage for using DO storage to list objects
		WORKER_BINDING_SERVICE_LOOPBACK,
		// Worker names for this instance, used to filter self from registry during aggregation
		{
			name: CoreBindings.JSON_LOCAL_EXPLORER_WORKER_NAMES,
			json: JSON.stringify(workerNames),
		},
		// Per-worker resource bindings for the /local/workers endpoint
		{
			name: CoreBindings.JSON_EXPLORER_WORKER_OPTS,
			json: JSON.stringify(explorerWorkerOpts),
		},
		{
			name: CoreBindings.JSON_TELEMETRY_CONFIG,
			json: JSON.stringify(telemetry),
		},
		{
			name: CoreBindings.DEV_REGISTRY_DEBUG_PORT,
			// workerdDebugPort bindings don't have any additional configuration
			workerdDebugPort: kVoid,
		},
	];

	if (hasDurableObjects) {
		// Add Durable Object namespace bindings for the explorer
		// Yes we are binding to 'unbound' DOs, but that has no effect
		// on the user's access via ctx.exports
		for (const durableObject of Object.values(bindingIdMap.do)) {
			explorerBindings.push({
				name: durableObject.binding,
				durableObjectNamespace: {
					className: durableObject.className,
					serviceName: getUserServiceName(durableObject.scriptName),
				},
			});
		}
	}

	// Add Engine DO namespace bindings for each workflow.
	// This gives the explorer direct access to Engine DOs via idFromString()
	// for the instance detail view. Same pattern as DO namespace bindings above.
	// The Engine DO has no alarms and its constructor is idempotent, so waking
	// it up for reads is safe.
	for (const workflowInfo of Object.values(bindingIdMap.workflows)) {
		explorerBindings.push({
			name: workflowInfo.engineBinding,
			durableObjectNamespace: {
				className: "Engine",
				serviceName: `workflows:${workflowInfo.name}`,
			},
		});
	}

	return [
		// Disk service for serving explorer UI assets
		{
			name: LOCAL_EXPLORER_DISK,
			disk: { path: localExplorerUiPath, writable: false },
		},
		{
			name: SERVICE_LOCAL_EXPLORER,
			worker: {
				compatibilityDate: "2026-01-01",
				compatibilityFlags: ["nodejs_compat"],
				modules: [
					{
						name: "explorer.worker.js",
						esModule: SCRIPT_LOCAL_EXPLORER(),
					},
				],
				bindings: explorerBindings,
			},
		},
	];
}

/**
 * Build binding ID map from proxyBindings, durableObjectClassNames, and workflow options.
 * Maps resource IDs to binding information for the local explorer.
 */
export function constructExplorerBindingMap(
	proxyBindings: Worker_Binding[],
	durableObjectClassNames: DurableObjectClassNames,
	workflowOptions?: Map<string, WorkflowOption>
): BindingIdMap {
	const IDToBindingName: BindingIdMap = {
		d1: {},
		kv: {},
		do: {},
		r2: {},
		workflows: {},
	};

	for (const binding of proxyBindings) {
		// D1 bindings: name = "MINIFLARE_PROXY:d1:worker-*:BINDING", wrapped.innerBindings[0].service.name = "d1:db:ID"
		if (
			binding.name?.startsWith(
				`${CoreBindings.DURABLE_OBJECT_NAMESPACE_PROXY}:d1:`
			) &&
			"wrapped" in binding
		) {
			const [innerBinding] = binding.wrapped?.innerBindings ?? [];
			assert(innerBinding && "service" in innerBinding);

			const databaseId = innerBinding.service?.name?.replace(/^d1:db:/, "");
			assert(databaseId);

			IDToBindingName.d1[databaseId] = binding.name;
		}

		// KV bindings: name = "MINIFLARE_PROXY:kv:worker:BINDING", kvNamespace.name = "kv:ns:ID"
		if (
			binding.name?.startsWith(
				`${CoreBindings.DURABLE_OBJECT_NAMESPACE_PROXY}:kv:`
			) &&
			"kvNamespace" in binding &&
			binding.kvNamespace?.name?.startsWith("kv:ns:")
		) {
			// Extract ID from service name "kv:ns:ID"
			const namespaceId = binding.kvNamespace.name.replace(/^kv:ns:/, "");
			IDToBindingName.kv[namespaceId] = binding.name;
		}

		// R2 bindings: name = "MINIFLARE_PROXY:r2:worker:BINDING", r2Bucket.name = "r2:bucket:ID"
		if (
			binding.name?.startsWith(
				`${CoreBindings.DURABLE_OBJECT_NAMESPACE_PROXY}:r2:`
			) &&
			"r2Bucket" in binding &&
			binding.r2Bucket?.name?.startsWith("r2:bucket:")
		) {
			// Extract bucket name from service name "r2:bucket:BUCKET_NAME"
			const bucketName = binding.r2Bucket.name.replace(/^r2:bucket:/, "");
			IDToBindingName.r2[bucketName] = binding.name;
		}
	}

	// Handle DOs separately, since we need more information than is
	// present in proxy bindings.
	// durableObjectClassNames includes internal and unbound DOs,
	// but not external ones, which we don't want anyway.
	for (const [serviceName, classMap] of durableObjectClassNames) {
		// Skip the dev registry proxy service (hosts external DO proxies)
		if (serviceName === getUserServiceName(SERVICE_DEV_REGISTRY_PROXY)) {
			continue;
		}
		const scriptName = serviceName.replace(/^core:user:/, "");
		for (const [className, classInfo] of classMap) {
			const uniqueKey = `${scriptName}-${className}`;
			IDToBindingName.do[uniqueKey] = {
				className,
				scriptName,
				useSQLite: classInfo.enableSql ?? false,
				binding: `EXPLORER_DO_${uniqueKey}`,
			};
		}
	}

	// Handle Workflows: detect workflow proxy bindings by the "workflows:" prefix
	// and enrich with workflow option metadata.
	// Workflow proxy binding names follow: MINIFLARE_PROXY:workflows:<worker>:<bindingName>
	if (workflowOptions) {
		for (const binding of proxyBindings) {
			if (
				!binding.name?.startsWith(
					`${CoreBindings.DURABLE_OBJECT_NAMESPACE_PROXY}:workflows:`
				)
			) {
				continue;
			}
			if (!("wrapped" in binding)) {
				continue;
			}

			// Extract the workflow name from the inner binding service name ("workflows:<name>")
			const [innerBinding] = binding.wrapped?.innerBindings ?? [];
			if (!innerBinding || !("service" in innerBinding)) {
				continue;
			}
			const serviceName = innerBinding.service?.name;
			if (!serviceName?.startsWith("workflows:")) {
				continue;
			}
			const workflowName = serviceName.replace(/^workflows:/, "");

			// Find the matching workflow option to get className / scriptName
			const workflowOpt = workflowOptions.get(workflowName);
			if (!workflowOpt) {
				continue;
			}

			IDToBindingName.workflows[workflowName] = {
				name: workflowName,
				className: workflowOpt.className,
				scriptName: workflowOpt.scriptName ?? "",
				binding: binding.name,
				engineBinding: `EXPLORER_WORKFLOW_ENGINE_${workflowName}`,
			} satisfies WorkflowBindingInfo;
		}
	}

	return IDToBindingName;
}

/**
 * Build per-worker resource bindings map for the local explorer.
 * Maps worker names to their resource bindings with IDs.
 */
export function constructExplorerWorkerOpts(
	allWorkerOpts: PluginWorkerOptions[],
	durableObjectClassNames: DurableObjectClassNames
): ExplorerWorkerOpts {
	const result: ExplorerWorkerOpts = {};

	for (const workerOpts of allWorkerOpts) {
		const workerName = workerOpts.core.name;
		if (!workerName) {
			continue;
		}
		const bindings: WorkerResourceBindings = {
			kv: [],
			d1: [],
			r2: [],
			do: [],
			workflows: [],
		};

		for (const [bindingName, ns] of namespaceEntries(
			workerOpts.kv.kvNamespaces
		)) {
			bindings.kv.push({ id: ns.id, bindingName });
		}

		for (const [bindingName, db] of namespaceEntries(
			workerOpts.d1.d1Databases
		)) {
			bindings.d1.push({ id: db.id, bindingName });
		}

		for (const [bindingName, bucket] of namespaceEntries(
			workerOpts.r2.r2Buckets
		)) {
			bindings.r2.push({ id: bucket.id, bindingName });
		}

		for (const [bindingName, designator] of Object.entries(
			workerOpts.do.durableObjects ?? {}
		)) {
			const doInfo = normaliseDurableObject(designator);
			const scriptName = doInfo.scriptName ?? workerName;
			const serviceName = getUserServiceName(scriptName);
			const uniqueKey = `${scriptName}-${doInfo.className}`;

			const classMap = durableObjectClassNames.get(serviceName);
			const classInfo = classMap?.get(doInfo.className);
			const useSqlite = classInfo?.enableSql ?? false;

			bindings.do.push({
				id: uniqueKey,
				bindingName,
				className: doInfo.className,
				scriptName,
				useSqlite,
			});
		}

		for (const [bindingName, workflow] of Object.entries(
			workerOpts.workflows.workflows ?? {}
		)) {
			bindings.workflows.push({
				id: workflow.name,
				bindingName,
				className: workflow.className,
				scriptName: workflow.scriptName ?? workerName,
			});
		}

		result[workerName] = bindings;
	}

	return result;
}

/**
 * We need to wrap and extend user Durable Object classes to inject an
 * internal sqlite introspection method for the local explorer to use.
 *
 * This generates a new entry module that replaces the original user entry
 * module, which re-exports everything with DO classes wrapped.
 */
function generateWrapperEntry(
	userEntryName: string,
	durableObjectClassNames: string[]
): string {
	const lines = [
		`import { createDurableObjectWrapper } from "./__mf_do_wrapper.js";`,
		`import * as __mf_original__ from "./${userEntryName}";`,
		// Re-export everything from original module
		`export * from "./${userEntryName}";`,
		`export default __mf_original__.default;`,
	];

	for (const className of durableObjectClassNames) {
		lines.push(
			`export const ${className} = createDurableObjectWrapper(__mf_original__.${className});`
		);
	}

	return lines.join("\n");
}

/**
 * Transforms worker modules to wrap Durable Object classes for the local explorer.
 *
 * This function modifies the modules array to:
 * 1. Insert a new wrapper entry module at the front (workerd uses first module as entry)
 * 2. Inject the wrapper helper module
 * 3. Keep the original entry module with its original name (preserves source mapping)
 */
export function wrapDurableObjectModules(
	modules: Worker_Module[],
	durableObjectClassNames: string[]
): Worker_Module[] {
	const entryModule = modules[0];

	const wrapperEntry = generateWrapperEntry(
		entryModule.name,
		durableObjectClassNames
	);

	// Build new modules array:
	// 1. New wrapper entry module (workerd uses first module as entry)
	// 2. Wrapper helper module with createDurableObjectWrapper
	// 3. All original modules unchanged (entry keeps its name for source mapping)
	return [
		{ name: "__mf_do_wrapper_entry.js", esModule: wrapperEntry },
		{ name: "__mf_do_wrapper.js", esModule: SCRIPT_DO_WRAPPER() },
		...modules,
	];
}
