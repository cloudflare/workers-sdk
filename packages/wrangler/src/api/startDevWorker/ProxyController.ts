import { readFileSync } from "node:fs";
import path from "node:path";
import { Miniflare } from "miniflare";
import { getBasePath } from "../../paths";
import type { StartDevWorkerOptions } from "./types";

export function createProxyWorker(
	userWorkerConfig: StartDevWorkerOptions
): Miniflare {
	const mf = new Miniflare({
		workers: [
			// ProxyWorker
			{
				script: readFileSync(
					path.join(getBasePath(), `templates/startDevWorker/ProxyWorker.ts`),
					"utf8"
				),
				port: userWorkerConfig.dev?.server?.port,
			},

			// InspectorProxyWorker
			{
				script: readFileSync(
					path.join(getBasePath(), `templates/startDevWorker/ProxyWorker.ts`),
					"utf8"
				),
				port: userWorkerConfig.dev?.inspector?.port,
			},
		],
	});

	return mf;
}
