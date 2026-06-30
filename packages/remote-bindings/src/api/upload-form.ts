import { createWorkerUploadForm } from "@cloudflare/deploy-helpers";
import proxyServerWorkerScript from "virtual:proxy-server-worker";
import type { Binding } from "@cloudflare/workers-utils";
import type { FormData } from "undici";

/**
 * Create a FormData upload for the ProxyServerWorker with the given bindings.
 *
 * Reuses the canonical `createWorkerUploadForm` (from `@cloudflare/deploy-helpers`,
 * which has no dependency on wrangler) so every remote binding type is serialised
 * identically to a real deploy. The worker itself is a single pre-bundled ES
 * module, and all bindings are marked `raw` so the edge gives the proxy worker
 * direct, pass-through access to the real resources.
 */
export function createProxyWorkerUploadForm(
	bindings: Record<string, Binding>
): FormData {
	const rawBindings: Record<string, Binding> = {};
	for (const [name, binding] of Object.entries(bindings)) {
		rawBindings[name] = { ...binding, raw: true } as Binding;
	}

	return createWorkerUploadForm(
		{
			name: "remote-bindings-proxy",
			main: {
				name: "ProxyServerWorker.mjs",
				filePath: "ProxyServerWorker.mjs",
				type: "esm",
				content: proxyServerWorkerScript,
			},
			modules: [],
			migrations: undefined,
			compatibility_date: "2025-04-28",
			compatibility_flags: [],
			keepVars: undefined,
			keepSecrets: undefined,
			keepBindings: undefined,
			logpush: undefined,
			sourceMaps: undefined,
			placement: undefined,
			tail_consumers: undefined,
			limits: undefined,
			assets: undefined,
			containers: undefined,
			observability: undefined,
			cache: undefined,
		},
		rawBindings
	);
}
