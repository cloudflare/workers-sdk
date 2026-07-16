import { readFileSync } from "node:fs";
import { Controller } from "./BaseController";
import type { ConfigUpdateEvent } from "./events";

export class BundlerController extends Controller {
	onConfigUpdate({ config }: ConfigUpdateEvent) {
		this.bus.dispatch({ type: "bundleStart", config });

		const entrypointSource = readFileSync(config.entrypoint, "utf8");

		this.bus.dispatch({
			type: "bundleComplete",
			config,
			bundle: {
				path: config.entrypoint,
				entrypointSource,
				type: "esm",
				modules: [],
			},
		});
	}
}
