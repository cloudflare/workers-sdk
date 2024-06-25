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
	latestInput?: Options;
	latestConfig?: Options;

	public set(input: Options) {
		const config = unwrapHook(input, this.latestInput);

		this.#updateConfig(config);
	}
	public patch(input: Partial<Options>) {
		assert(
			this.latestInput,
			"Cannot call updateConfig without previously calling setConfig"
		);

		const config: Options = {
			...this.latestInput,
			...input,
		};

		this.#updateConfig(config);
	}

	#updateConfig(input: Options) {
		const directory = input.directory;

		this.latestConfig = {
			directory,
			build: {
				moduleRules: [],
				additionalModules: [],
				define: {},
				format: "modules",
				moduleRoot: directory, // TODO: this default needs to come from getEntry() once readConfig has been moved into ConfigController
				...input.build,
			},
			...input,
		};
		this.latestInput = input;
		this.emitConfigUpdateEvent(this.latestConfig);
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
