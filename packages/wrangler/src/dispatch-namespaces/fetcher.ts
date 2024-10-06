import { fetch, Response } from "miniflare";
import { UserError } from "../errors";
import type { WorkerDefinition } from "../dev-registry";
import type { Request } from "miniflare";

export const EXTERNAL_DISPATCH_WORKER_NAME =
	"__WRANGLER_EXTERNAL_DISPATCH_WORKER";

const HEADER_SCRIPT_NAME = "X-Miniflare-Dispatch-Script-Name";
export const HEADER_URL = "X-Miniflare-Dispatch-URL";
export const HEADER_OUTBOUND_PROXY_URL =
	"X-Miniflare-Dispatch-Outbound-Proxy-URL";
export const HEADER_PARAMETERS = "X-Miniflare-Dispatch-Outbound-Parameters";
export const HEADER_CF_BLOB = "X-Miniflare-Dispatch-Cf-Blob";

// This should probably be doing all the clever proxy class stuff in miniflare.ts
export const generateExternalDispatchWorkerScript = (
	parameters: string[] = []
) => `
const HEADER_SCRIPT_NAME = ${JSON.stringify(HEADER_SCRIPT_NAME)};
const HEADER_URL = ${JSON.stringify(HEADER_URL)};
const HEADER_OUTBOUND_PROXY_URL = ${JSON.stringify(HEADER_OUTBOUND_PROXY_URL)};
const HEADER_PARAMETERS = ${JSON.stringify(HEADER_PARAMETERS)};
const HEADER_CF_BLOB = ${JSON.stringify(HEADER_CF_BLOB)};

const ALLOWED_PARAMETERS = ${JSON.stringify(parameters)};

export default function (env) {
    return {
			get(name, args, options) {
				return {
					fetch(input, init) {
						const request = new Request(input, init);
						request.headers.set(HEADER_SCRIPT_NAME, name);
						request.headers.set(HEADER_URL, request.url);
						request.headers.set(HEADER_PARAMETERS, JSON.stringify(Object.fromEntries(Object.entries(options?.outbound ?? {}).filter(([key]) => ALLOWED_PARAMETERS.includes(key)))));
						request.headers.set(HEADER_CF_BLOB, JSON.stringify(request.cf));
						return env.FETCHER.fetch(request);
					}
				}
			}
		}
}
`;

export function generateDispatchFetcher(
	namespace: string,
	outbound?: { service: string },
	workerDefinitions: Record<string, WorkerDefinition> = {}
) {
	return async (request: Request): Promise<Response> => {
		const scriptName = request.headers.get(HEADER_SCRIPT_NAME);
		const dispatcheeTarget = Object.entries(workerDefinitions).find(
			([name, workerDefinition]) =>
				name === scriptName && workerDefinition.dispatchNamespace === namespace
		)?.[1];

		if (!dispatcheeTarget) {
			return new Response(
				`[wrangler] Couldn't find \`wrangler dev\` session for "${scriptName}" in namespace "${namespace}" to proxy to`,
				{ status: 503 }
			);
		}

		if (
			dispatcheeTarget.host === undefined ||
			dispatcheeTarget.port === undefined
		) {
			return new Response(
				`[wrangler] Couldn't find \`wrangler dev\` session for "${scriptName}" in namespace "${namespace}" to proxy to`,
				{ status: 503 }
			);
		} else if (dispatcheeTarget.protocol === "https") {
			throw new UserError(
				`Cannot proxy to \`wrangler dev\` session for "${scriptName}" in namespace "${namespace}" because it uses HTTPS. Please remove the \`--local-protocol\`/\`dev.local_protocol\` option.`
			);
		} else {
			const proxyUrl = `http://${dispatcheeTarget.host}:${dispatcheeTarget.port}/`;

			request.headers.delete(HEADER_SCRIPT_NAME);

			if (outbound !== undefined) {
				const outboundTarget = workerDefinitions[outbound.service];
				if (!outboundTarget) {
					return new Response(
						`[wrangler] Couldn't find \`wrangler dev\` session for "${outbound.service}" to proxy to`,
						{ status: 503 }
					);
				}

				if (
					outboundTarget.host === undefined ||
					outboundTarget.port === undefined
				) {
					return new Response(
						`[wrangler] Couldn't find \`wrangler dev\` session for "${outbound.service}" to proxy to`,
						{ status: 503 }
					);
				} else if (outboundTarget.protocol === "https") {
					throw new UserError(
						`Cannot proxy to \`wrangler dev\` session for "${outbound.service}" to proxy to because it uses HTTPS. Please remove the \`--local-protocol\`/\`dev.local_protocol\` option.`
					);
				} else {
					const outboundProxyUrl = `http://${outboundTarget.host}:${outboundTarget.port}/`;

					request.headers.set(HEADER_OUTBOUND_PROXY_URL, outboundProxyUrl);
				}
			}

			return fetch(proxyUrl, request);
		}
	};
}
