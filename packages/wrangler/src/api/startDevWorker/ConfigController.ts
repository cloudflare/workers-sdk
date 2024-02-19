import { EventEmitter } from "node:events";
// import { readFileSync } from "../../parse";
import { notImplemented } from "./NotImplementedError";
import type { ConfigUpdateEvent, ErrorEvent } from "./events";
import type { StartDevWorkerOptions } from "./types";

export class ConfigController extends EventEmitter {
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

	// *********************
	//   Event Subscribers
	// *********************

	on(event: "configUpdate", listener: (_: ConfigUpdateEvent) => void): this;
	// @ts-expect-error Missing overload implementation (only need the signature types, base implementation is fine)
	on(event: "error", listener: (_: ErrorEvent) => void): this;
	// @ts-expect-error Missing initialisation (only need the signature types, base implementation is fine)
	once: typeof this.on;
}
