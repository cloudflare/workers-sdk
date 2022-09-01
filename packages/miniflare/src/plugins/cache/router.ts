import { Response } from "undici";
import {
	DELETE,
	GET,
	PUT,
	RouteHandler,
	Router,
	decodePersist,
} from "../shared";
import { CacheGateway } from "./gateway";

export interface CacheParams {
	namespace: string;
	key: string;
}
export class CacheRouter extends Router<CacheGateway> {
	@GET("/:namespace/:key")
	match: RouteHandler<CacheParams> = async (req, params) => {
		const persist = decodePersist(req.headers);
		const gateway = this.gatewayFactory.get(params.namespace, persist);
		await gateway.match(params.key);
		return new Response();
	};

	@PUT("/:namespace/:key")
	put: RouteHandler<CacheParams> = async (req, params) => {
		const persist = decodePersist(req.headers);
		const gateway = this.gatewayFactory.get(params.namespace, persist);
		await gateway.put(params.key, new Uint8Array(await req.arrayBuffer()));
		return new Response();
	};

	@DELETE("/:namespace/:key")
	delete: RouteHandler<CacheParams> = async (req, params) => {
		const persist = decodePersist(req.headers);
		const gateway = this.gatewayFactory.get(params.namespace, persist);
		await gateway.delete(params.key);
		return new Response();
	};
}
