import { WorkerEntrypoint } from "cloudflare:workers";
import type RouterWorker from "@cloudflare/workers-shared/asset-worker/src/index";

interface Env {
	ROUTER_WORKER: Service<RouterWorker>;
}
export default class RPCProxyWorker extends WorkerEntrypoint<Env> {
	async fetch(request: Request) {
		// for now forward everything to the ROUTER WORKER
		// this way we can wire this proxy Worker without
		// changing the current assets behaviour
		return this.env.ROUTER_WORKER.fetch(request);
	}
}
