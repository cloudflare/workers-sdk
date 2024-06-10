import { Controller } from "./BaseController";
import { notImplemented } from "./NotImplementedError";
import type { ControllerEventMap } from "./BaseController";
import type { ConfigUpdateEvent } from "./events";
import type { StartDevWorkerOptions } from "./types";

export type ConfigControllerEventMap = ControllerEventMap & {
	configUpdate: [ConfigUpdateEvent];
};
export class ConfigController extends Controller<ConfigControllerEventMap> {
	config?: StartDevWorkerOptions;

	setOptions(_: StartDevWorkerOptions) {
		notImplemented(this.setOptions.name, this.constructor.name);
	}
	updateOptions(_: Partial<StartDevWorkerOptions>) {
		notImplemented(this.updateOptions.name, this.constructor.name);
	}

	// ******************
	//   Event Handlers
	// ******************

	async teardown() {
		notImplemented(this.teardown.name, this.constructor.name);
	}

	// *********************
	//   Event Dispatchers
	// *********************

	emitConfigUpdateEvent(data: ConfigUpdateEvent) {
		this.emit("configUpdate", data);
	}
}
