// @ts-nocheck
/// <reference path="middleware-multiworker-dev.d.ts"/>

import { workers } from "config:middleware/multiworker-dev";
import type { WorkerRegistry } from "../../src/dev-registry";

export function wrap(env: Record<string, unknown>) {
	const facadeEnv = { ...env };
	// For every Worker definition that's available,
	// create a fetcher for it on the facade env.
	// for const [name,  binding] of env
	// if Workers[name]
	// const details = Workers[name];

	for (const [name, details] of Object.entries(workers as WorkerRegistry)) {
		if (details) {
			facadeEnv[name] = {
				async fetch(...reqArgs: Parameters<Fetcher["fetch"]>) {
					const reqFromArgs = new Request(...reqArgs);
					if (details.headers) {
						for (const [key, value] of Object.entries(details.headers)) {
							// In remote mode, you need to add a couple of headers
							// to make sure it's talking to the 'dev' preview session
							// (much like wrangler dev already does via proxy.ts)
							reqFromArgs.headers.set(key, value);
						}
						return (env[name] as Fetcher).fetch(reqFromArgs);
					}

					const url = new URL(reqFromArgs.url);
					if (details.protocol !== undefined) {
						url.protocol = details.protocol;
					}
					if (details.host !== undefined) {
						url.host = details.host;
					}
					if (details.port !== undefined) {
						url.port = details.port.toString();
					}

					const request = new Request(url.toString(), reqFromArgs);
					return fetch(request);
				},
			};
		} else {
			// This means there's no dev binding available.
			// Let's use whatever's available, or put a shim with a message.
			facadeEnv[name] = facadeEnv[name] || {
				async fetch() {
					return new Response(
						`You should start up wrangler dev --local on the ${name} worker`,
						{ status: 404 }
					);
				},
			};
		}
	}
	return facadeEnv;
}
