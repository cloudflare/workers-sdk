import assert from "node:assert";
import deepmerge from "deepmerge";
import { Controller } from "./BaseController";
import { unwrapHook } from "./utils";
import type { ControllerEventMap } from "./BaseController";
import type { ConfigUpdateEvent } from "./events";
import type { Hook, StartDevWorkerOptions } from "./types";

export type ConfigControllerEventMap = ControllerEventMap & {
	configUpdate: [ConfigUpdateEvent];
};

type Options = StartDevWorkerOptions;
export class ConfigController extends Controller<ConfigControllerEventMap> {
	config?: Options;

	public set(input: Hook<Options, [Readonly<Options> | undefined]>) {
		const config = unwrapHook(input, this.latest);

		this.#updateConfig(config);
	}
	public patch(input: Hook<Partial<Options>, [Readonly<Options>]>) {
		assert(
			this.latest,
			"Cannot call updateConfig without previously calling setConfig"
		);

		const partialConfig = unwrapHook(input, this.latest);

		const config = deepmerge(this.latest, partialConfig, {
			arrayMerge: (target, _source, _options) => target, // arrays are overridden, not concatenated (deepmerge default)
		});

		this.#updateConfig(config);
	}

	latest?: Options;
	#updateConfig(input: Options) {
		this.latest = input;
		this.emitConfigUpdateEvent(this.latest);
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
