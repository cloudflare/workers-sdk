import { Controller } from "./BaseController";
import type { StartDevWorkerOptions } from "./types";

export class ConfigController extends Controller {
	public set(options: StartDevWorkerOptions) {
		this.emitConfigUpdateEvent(options);
	}

	public patch(options: StartDevWorkerOptions) {
		this.emitConfigUpdateEvent(options);
	}

	emitConfigUpdateEvent(config: StartDevWorkerOptions) {
		this.bus.dispatch({ type: "configUpdate", config });
	}
}
