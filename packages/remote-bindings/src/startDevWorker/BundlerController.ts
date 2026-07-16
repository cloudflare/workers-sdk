import { readFileSync } from "node:fs";
import path from "node:path";
import { Controller } from "./BaseController";
import type { ConfigUpdateEvent } from "./events";

export class BundlerController extends Controller {
	onConfigUpdate({ config }: ConfigUpdateEvent) {
		this.bus.dispatch({ type: "bundleStart", config });

		const entrypointSource = readFileSync(config.entrypoint, "utf8");
		const moduleRoot = path.dirname(config.entrypoint);

		this.bus.dispatch({
			type: "bundleComplete",
			config,
			bundle: {
				id: 0,
				path: config.entrypoint,
				entrypointSource,
				entry: {
					file: config.entrypoint,
					projectRoot: moduleRoot,
					configPath: undefined,
					format: "modules",
					moduleRoot,
					name: config.name,
					exports: [],
				},
				type: "esm",
				modules: [],
				dependencies: {},
			},
		});
	}
}
