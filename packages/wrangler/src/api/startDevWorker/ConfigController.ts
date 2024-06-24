import assert from "node:assert";
import { Controller } from "./BaseController";
import { unwrapHook } from "./utils";
import type { ControllerEventMap } from "./BaseController";
import type { ConfigUpdateEvent } from "./events";
import type { StartDevWorkerOptions } from "./types";

export type ConfigControllerEventMap = ControllerEventMap & {
	configUpdate: [ConfigUpdateEvent];
};

type Options = StartDevWorkerOptions;
export class ConfigController extends Controller<ConfigControllerEventMap> {
	config?: Options;

	public set(input: Options) {
		const config = unwrapHook(input, this.latest);

		this.#updateConfig(config);
	}
	public patch(input: Partial<Options>) {
		assert(
			this.latest,
			"Cannot call updateConfig without previously calling setConfig"
		);

		const config: Options = {
			...this.latest,
			...input,
		};

		this.#updateConfig(config);
	}

	latest?: Options;
	#updateConfig(input: Options) {
		const directory = input.directory;

		this.config = {
			directory,
			build: {
				moduleRules: [],
				additionalModules: [],
				define: {},
				format: "modules",
				moduleRoot: directory,
				...input.build,
			},
			...input,
		};
		this.latest = input;
		this.emitConfigUpdateEvent(this.config);
	}

	// ******************
	//   Event Handlers
	// ******************

	async teardown() {
		// do nothing
	}

	// *********************
	//   Event Dispatchers
	// *********************

	emitConfigUpdateEvent(config: Options) {
		this.emit("configUpdate", { type: "configUpdate", config });
	}
}
