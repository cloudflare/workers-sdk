import assert from "node:assert";
import http from "node:http";
import { z } from "zod";
import {
	getUserServiceName,
	kCurrentWorker,
	ServiceDesignatorSchema,
} from "../plugins/core";
import { RemoteProxyConnectionString } from "../plugins/shared";
import {
	HttpOptions,
	HttpOptions_Style,
	kVoid,
	Service,
	Worker_DurableObjectNamespace,
} from "../runtime";
import { CoreHeaders } from "../workers";

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
	} else if (typeof service === "object" && "name" in service) {
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

export function createProxyFallbackService(
	serviceName: string,
	entrypoints: Set<string | undefined>
): Service {
	return {
		name: `proxy:fallback:${serviceName}`,
		worker: {
			compatibilityDate: "2025-05-01",
			modules: [
				{
					name: "fallback-service.mjs",
					esModule: [
						`
                            import { WorkerEntrypoint } from "cloudflare:workers";

                            ${CREATE_PROXY_PROTOTYPE_CLASS_HELPER_SCRIPT}

                            function createFallbackWorkerEntrypointClass({ service, entrypoint }) {
                                const klass = createProxyPrototypeClass(WorkerEntrypoint, (key) => {
                                    throw new Error(
                                       \`Cannot access "\${key}" as we couldn't find a local dev session for the "\${entrypoint}" entrypoint of service "\${service}" to proxy to.\`
                                    );
                                });

                                // Return regular HTTP response for HTTP requests
                                klass.prototype.fetch = function(request) {
                                    const message = \`Couldn't find a local dev session for the "\${entrypoint}" entrypoint of service "\${service}" to proxy to\`;
                                    return new Response(message, { status: 503 });
                                };

								// For tail handler support
								klass.prototype.tail = function(events) {
                                    // no-op
                                };

                                return klass;
                            }
                        `,
						...Array.from(entrypoints).map(
							(entrypoint = "default") =>
								`export ${entrypoint === "default" ? "default" : `const ${entrypoint} =`} createFallbackWorkerEntrypointClass({ service: "${serviceName}", entrypoint: "${entrypoint}" });`
						),
					].join("\n"),
				},
			],
		},
	};
}

export const INBOUND_DO_PROXY_SERVICE_NAME = "proxy:do:inbound";
export const OUTBOUND_DO_PROXY_SERVICE_NAME = "proxy:do:outbound";

/**
 * A well known URL to the inbound do proxy worker
 * This should match the Wrangler implementation for backwards compatibility
 *
 * @see https://github.com/cloudflare/workers-sdk/blob/362cb0be3fa28bbf007491f7156ecb522bd7ee43/packages/wrangler/src/dev/miniflare.ts#L52-L59
 */
export const INBOUND_DO_PROXY_SERVICE_PATH =
	"__WRANGLER_EXTERNAL_DURABLE_OBJECTS_WORKER";

/*
 * Create a service that routes fetch requests to the internal durable objects
 * This is used to support external durable objects with the DevRegistry in which
 * The a proxy durable object is created and will forward requests to a well known
 * URL of the other workerd process
 */
export function createInboundDoProxyService(
	internalObjects: Array<[string, string]>
): Service {
	return {
		// This is treated as a user service to support custom routes
		name: getUserServiceName(INBOUND_DO_PROXY_SERVICE_NAME),
		worker: {
			compatibilityDate: "2025-05-01",
			// Define bindings for each internal durable objects
			bindings: internalObjects.map(([scriptName, className]) => ({
				name: `${scriptName}_${className}`,
				durableObjectNamespace: {
					className,
					serviceName: getUserServiceName(scriptName),
				},
			})),
			modules: [
				{
					name: "proxy.mjs",
					esModule: `
                        const HEADER_URL = "${PROXY_OBJECT_URL_HEADER}";
                        const HEADER_NAME = "${PROXY_OBJECT_NAME_HEADER}";
                        const HEADER_SCRIPT = "${PROXY_OBJECT_SCRIPT_HEADER}";
                        const HEADER_ID = "${PROXY_OBJECT_ID_HEADER}";
                        const HEADER_CF_BLOB = "${PROXY_OBJECT_CF_BLOB_HEADER}";

                        export default {
                            async fetch(request, env) {
                                const originalUrl = request.headers.get(HEADER_URL);
                                const className = request.headers.get(HEADER_NAME);
                                const scriptName = request.headers.get(HEADER_SCRIPT);
                                const idString = request.headers.get(HEADER_ID);
                                const cfBlob = request.headers.get(HEADER_CF_BLOB);
                                if (originalUrl === null || className === null || idString === null || cfBlob === null) {
                                    return new Response("Received Durable Object proxy request with missing headers", { status: 400 });
                                }
                                if (scriptName === null) {
                                    return new Response("Durable object proxy to a vite dev session requires wrangler v4.x.x or later", { status: 501 });
                                }
                                request = new Request(originalUrl, request);
                                request.headers.delete(HEADER_URL);
                                request.headers.delete(HEADER_NAME);
                                request.headers.delete(HEADER_SCRIPT);
                                request.headers.delete(HEADER_ID);
                                request.headers.delete(HEADER_CF_BLOB);
                                const ns = env[scriptName + '_' + className];
                                const id = ns.idFromString(idString);
                                const stub = ns.get(id);
                                return stub.fetch(request, { cf: JSON.parse(cfBlob) });
                            }
                        }
                    `,
				},
			],
		},
	};
}

const unsafeVariableCharRegex = /[^0-9a-zA-Z_\$]/g;

export function getOutboundDoProxyClassName(
	scriptName: string,
	className: string
) {
	return `${scriptName.replace(unsafeVariableCharRegex, "_")}_${className}`;
}

export function createOutboundDoProxyService(
	externalObjects: Array<[string, string]>,
	loopbackAddress: string,
	isProxyEnabled: boolean
): Service {
	return {
		// The DO plugin will prefix the script name with the user service name
		// This makes sure it matches the result script name on the worker binding
		name: getUserServiceName(OUTBOUND_DO_PROXY_SERVICE_NAME),
		worker: {
			compatibilityDate: "2025-05-01",
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
			modules: [
				{
					name: "proxy.mjs",
					esModule: [
						`
                            import { DurableObject } from "cloudflare:workers";

                            ${CREATE_PROXY_PROTOTYPE_CLASS_HELPER_SCRIPT}

                            function createProxyDurableObjectClass({ scriptName, className, proxyUrl }) {
                                const klass = createProxyPrototypeClass(DurableObject, (key) => {
									const message = ${
										isProxyEnabled
											? `\`Cannot access "\${className}#\${key}" as Durable Object RPC is not yet supported between multiple dev sessions.\``
											: `\`Couldn't find the durable Object "\${className}" of script "\${scriptName}".\``
									};

                                    throw new Error(message);
                                });

                                // Forward regular HTTP requests to the other dev session
                                klass.prototype.fetch = function(request) {
                                    const proxyRequest = new Request(proxyUrl, request);
                                    proxyRequest.headers.set("${PROXY_OBJECT_URL_HEADER}", request.url);
                                    proxyRequest.headers.set("${PROXY_OBJECT_NAME_HEADER}", className);
                                    proxyRequest.headers.set("${PROXY_OBJECT_SCRIPT_HEADER}", scriptName);
                                    proxyRequest.headers.set("${PROXY_OBJECT_ID_HEADER}", this.ctx.id.toString());
                                    proxyRequest.headers.set("${PROXY_OBJECT_CF_BLOB_HEADER}", JSON.stringify(request.cf ?? {}));
                                    return fetch(proxyRequest);
                                };

                                return klass;
                            }
                        `,
						...Array.from(externalObjects).map(
							([scriptName, className]) =>
								`export const ${getOutboundDoProxyClassName(scriptName, className)} = createProxyDurableObjectClass({ scriptName: "${scriptName}", className: "${className}", proxyUrl: "${loopbackAddress}" });`
						),
					].join("\n"),
				},
			],
		},
	};
}

export function getHttpProxyOptions(
	service: string,
	entrypoint: string | undefined
): HttpOptions {
	return {
		style: HttpOptions_Style.PROXY,
		// To make sure `request.cf` is set correctly
		cfBlobHeader: CoreHeaders.CF_BLOB,
		// Use the service name and entrypoint as the host to proxy RPC calls
		capnpConnectHost: `${encodeURIComponent(service)}:${encodeURIComponent(entrypoint ?? "default")}`,
		// The headers are injected only for fetch and are used for proxying fetch requests
		injectRequestHeaders: [
			{
				name: PROXY_SERVICE_HEADER,
				value: service,
			},
			{
				name: PROXY_ENTRYPOINT_HEADER,
				value: entrypoint ?? "default",
			},
		],
	};
}

export function getProxyFallbackServiceSocketName(
	service: string,
	entrypoint: string | undefined
): string {
	return `proxy-fallback-${service}-${entrypoint ?? "default"}`;
}

export function getProtocol(url: URL): "http" | "https" {
	const protocol = url.protocol.substring(0, url.protocol.length - 1);

	assert(
		protocol === "http" || protocol === "https",
		"Expected protocol to be http or https"
	);

	return protocol;
}

export function extractServiceFetchProxyTarget(req: http.IncomingMessage): {
	service: string;
	entrypoint: string;
} | null {
	// The parsed headers are always in lowercase
	const service = req.headers[PROXY_SERVICE_HEADER.toLowerCase()];
	const entrypoint = req.headers[PROXY_ENTRYPOINT_HEADER.toLowerCase()];

	if (typeof service !== "string" || typeof entrypoint !== "string") {
		// This is not a external fetch request. No proxying needed.
		return null;
	}

	// Remove the headers from the request
	// to avoid sending them to the target service
	delete req.headers[PROXY_SERVICE_HEADER.toLowerCase()];
	delete req.headers[PROXY_ENTRYPOINT_HEADER.toLowerCase()];

	return {
		service,
		entrypoint,
	};
}

export function extractDoFetchProxyTarget(req: http.IncomingMessage): {
	scriptName: string;
	className: string;
} | null {
	// The parsed headers are always in lowercase
	// These headers will be removed by the proxy worker later
	const url = req.headers[PROXY_OBJECT_URL_HEADER.toLowerCase()];
	const id = req.headers[PROXY_OBJECT_ID_HEADER.toLowerCase()];
	const cfBlob = req.headers[PROXY_OBJECT_CF_BLOB_HEADER.toLowerCase()];
	const scriptName = req.headers[PROXY_OBJECT_SCRIPT_HEADER.toLowerCase()];
	const className = req.headers[PROXY_OBJECT_NAME_HEADER.toLowerCase()];

	if (
		typeof url !== "string" ||
		typeof id !== "string" ||
		typeof cfBlob !== "string" ||
		typeof scriptName !== "string" ||
		typeof className !== "string"
	) {
		// This is not a external do fetch request. No proxying needed.
		return null;
	}

	return {
		scriptName,
		className,
	};
}

// These headers must match the wrangler implementation for backwards compatibility
const PROXY_OBJECT_URL_HEADER = "X-Miniflare-Durable-Object-URL";
const PROXY_OBJECT_NAME_HEADER = "X-Miniflare-Durable-Object-Name";
const PROXY_OBJECT_ID_HEADER = "X-Miniflare-Durable-Object-Id";
const PROXY_OBJECT_CF_BLOB_HEADER = "X-Miniflare-Durable-Object-Cf-Blob";
// This is added to support fetching external DO with multi workers
const PROXY_OBJECT_SCRIPT_HEADER = "X-Miniflare-Durable-Object-Script";
// Theses headers are used to proxy fetch requests to external service bindings
const PROXY_SERVICE_HEADER = "X-Miniflare-Proxy-Service";
const PROXY_ENTRYPOINT_HEADER = "X-Miniflare-Proxy-Entrypoint";
// Helper script to create a proxy class for the handler
// Used in the fallback service script
const CREATE_PROXY_PROTOTYPE_CLASS_HELPER_SCRIPT = `
    const HANDLER_RESERVED_KEYS = new Set([
        "alarm",
        "scheduled",
        "self",
        "tail",
        "tailStream",
        "test",
        "trace",
        "webSocketClose",
        "webSocketError",
        "webSocketMessage",
    ]);

    function createProxyPrototypeClass(handlerSuperKlass, getUnknownPrototypeKey) {
        // Build a class with a "Proxy"-prototype, so we can intercept RPC calls and
        // throw unsupported exceptions :see_no_evil:
        function klass(ctx, env) {
            // Delay proxying prototype until construction, so workerd sees this as a
            // regular class when introspecting it. This check fails if we don't do this:
            // https://github.com/cloudflare/workerd/blob/9e915ed637d65adb3c57522607d2cd8b8d692b6b/src/workerd/io/worker.c%2B%2B#L1920-L1921
            klass.prototype = new Proxy(klass.prototype, {
                get(target, key, receiver) {
                    const value = Reflect.get(target, key, receiver);
                    if (value !== undefined) return value;
                    if (HANDLER_RESERVED_KEYS.has(key)) return;
                    return getUnknownPrototypeKey(key);
                }
            });

            return Reflect.construct(handlerSuperKlass, [ctx, env], klass);
        }

        Reflect.setPrototypeOf(klass.prototype, handlerSuperKlass.prototype);
        Reflect.setPrototypeOf(klass, handlerSuperKlass);

        return klass;
    }
`;
