import assert from "node:assert";
import SCRIPT_DO_WRAPPER from "worker:core/do-wrapper";
import SCRIPT_LOCAL_EXPLORER from "worker:local-explorer/explorer";
import { Service, Worker_Binding, Worker_Module } from "../../runtime";
import { OUTBOUND_DO_PROXY_SERVICE_NAME } from "../../shared/external-service";
import { CoreBindings } from "../../workers";
import {
	DurableObjectClassNames,
	WORKER_BINDING_SERVICE_LOOPBACK,
} from "../shared";
import {
	getUserServiceName,
	LOCAL_EXPLORER_DISK,
	SERVICE_LOCAL_EXPLORER,
} from "./constants";
import type { BindingIdMap } from "./types";

export interface ExplorerServicesOptions {
	localExplorerUiPath: string;
	proxyBindings: Worker_Binding[];
	bindingIdMap: BindingIdMap;
	hasDurableObjects: boolean;
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
	];

	if (hasDurableObjects) {
		// Add loopback service binding if DOs are configured
		// The explorer worker uses this to call the /core/do-storage endpoint
		// which reads the filesystem using Node.js (bypassing workerd disk service issues on Windows)
		explorerBindings.push(WORKER_BINDING_SERVICE_LOOPBACK);

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
 * Build binding ID map from proxyBindings and durableObjectClassNames
 * Maps resource IDs to binding information for the local explorer
 */
export function constructExplorerBindingMap(
	proxyBindings: Worker_Binding[],
	durableObjectClassNames: DurableObjectClassNames
): BindingIdMap {
	const IDToBindingName: BindingIdMap = {
		d1: {},
		kv: {},
		do: {},
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
	}

	// Handle DOs separately, since we need more information than is
	// present in proxy bindings.
	// durableObjectClassNames includes internal and unbound DOs,
	// but not external ones, which we don't want anyway.
	for (const [serviceName, classMap] of durableObjectClassNames) {
		// Skip the outbound DO proxy service (used for external DOs)
		if (serviceName === getUserServiceName(OUTBOUND_DO_PROXY_SERVICE_NAME)) {
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

	return IDToBindingName;
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
