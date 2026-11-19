import { isSitesRequest } from "../kv";
import { miss } from "./cache-entry-noop.worker";

interface Env {
	CACHE: Fetcher;
}

// In front of workerd's `cache` service for a Worker with Workers Sites: Sites
// requests are never cached, so the files on disk are always served.
export default <ExportedHandler<Env>>{
	fetch(request, env) {
		return isSitesRequest(request) ? miss(request) : env.CACHE.fetch(request);
	},
};
