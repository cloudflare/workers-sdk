import SCRIPT_DEV_REGISTRY_PROXY_SHARED from "worker:core/dev-registry-proxy-shared";
import { z } from "zod";
import {
	getUserServiceName,
	kCurrentWorker,
	ServiceDesignatorSchema,
} from "../plugins/core";
import { kResolvedServiceDesignator } from "../plugins/core/services";
import { RemoteProxyConnectionString } from "../plugins/shared";
import { WORKER_BINDING_DEV_REGISTRY_DISK } from "../plugins/shared/constants";
import { kVoid, Service, Worker_DurableObjectNamespace } from "../runtime";

export function normaliseServiceDesignator(
	service: z.infer<typeof ServiceDesignatorSchema>
): {
	serviceName: string | undefined;
	entrypoint: string | undefined;
	remoteProxyConnectionString: RemoteProxyConnectionString | undefined;
} {
	let serviceName: string | undefined;
	let entrypoint: string | undefined;
	let remoteProxyConnectionString: RemoteProxyConnectionString | undefined;

	if (typeof service === "string") {
		serviceName = service;
	} else if (
		typeof service === "object" &&
		"name" in service &&
		!(kResolvedServiceDesignator in service)
	) {
		serviceName = service.name !== kCurrentWorker ? service.name : undefined;
		entrypoint = service.entrypoint;
		remoteProxyConnectionString = service.remoteProxyConnectionString;
	}

	return {
		serviceName,
		entrypoint,
		remoteProxyConnectionString,
	};
}

export const OUTBOUND_DO_PROXY_SERVICE_NAME = "proxy:do:outbound";

const unsafeVariableCharRegex = /[^0-9a-zA-Z_\$]/g;

export function getOutboundDoProxyClassName(
	scriptName: string,
	className: string
) {
	return `${scriptName.replace(unsafeVariableCharRegex, "_")}_${className}`;
}

export function createOutboundDoProxyService(
	externalObjects: Array<[string, string]>
): Service {
	// The entrypoint module imports createProxyDurableObjectClass from the
	// shared module and exports one DO class per external object.
	const entrypointSource = [
		`import { createProxyDurableObjectClass } from "./dev-registry-proxy-shared.worker.js";`,
		...Array.from(externalObjects).map(
			([scriptName, className]) =>
				`export const ${getOutboundDoProxyClassName(scriptName, className)} = createProxyDurableObjectClass({ scriptName: "${scriptName}", className: "${className}" });`
		),
	].join("\n");

	return {
		// The DO plugin will prefix the script name with the user service name
		// This makes sure it matches the result script name on the worker binding
		name: getUserServiceName(OUTBOUND_DO_PROXY_SERVICE_NAME),
		worker: {
			compatibilityDate: "2025-05-01",
			compatibilityFlags: ["nodejs_compat"],
			// Use in-memory storage for the stub object classes *declared* by this
			// script. They don't need to persist anything, and would end up using the
			// incorrect unsafe unique key.
			durableObjectStorage: { inMemory: kVoid },
			durableObjectNamespaces:
				externalObjects.map<Worker_DurableObjectNamespace>(
					([scriptName, className]) =>
						({
							className: getOutboundDoProxyClassName(scriptName, className),
							uniqueKey: `${scriptName}-${className}`,
						}) satisfies Worker_DurableObjectNamespace
				),
			bindings: [
				{
					name: "DEV_REGISTRY_DEBUG_PORT",
					workerdDebugPort: kVoid,
				},
				WORKER_BINDING_DEV_REGISTRY_DISK,
			],
			modules: [
				{
					name: "proxy.mjs",
					esModule: entrypointSource,
				},
				{
					name: "dev-registry-proxy-shared.worker.js",
					esModule: SCRIPT_DEV_REGISTRY_PROXY_SHARED(),
				},
			],
		},
	};
}
