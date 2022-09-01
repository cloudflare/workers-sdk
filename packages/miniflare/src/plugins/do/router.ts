import { Response } from "undici";
import {
	DELETE,
	GET,
	PUT,
	RouteHandler,
	Router,
	decodePersist,
} from "../shared";
import { DurableObjectsStorageGateway } from "./gateway";

export interface DurableObjectStorageParams {
	namespace: string;
	key: string;
}
export class DurableObjectsStorageRouter extends Router<DurableObjectsStorageGateway> {
	@GET("/:bucket/:key")
	get: RouteHandler<DurableObjectStorageParams> = async (req, params) => {
		const persist = decodePersist(req.headers);
		const gateway = this.gatewayFactory.get(params.namespace, persist);
		await gateway.get(params.key);
		return new Response();
	};

	@PUT("/:bucket/:key")
	put: RouteHandler<DurableObjectStorageParams> = async (req, params) => {
		const persist = decodePersist(req.headers);
		const gateway = this.gatewayFactory.get(params.namespace, persist);
		await gateway.put(params.key, new Uint8Array(await req.arrayBuffer()));
		return new Response();
	};

	@DELETE("/:bucket/:key")
	delete: RouteHandler<DurableObjectStorageParams> = async (req, params) => {
		const persist = decodePersist(req.headers);
		const gateway = this.gatewayFactory.get(params.namespace, persist);
		await gateway.delete(params.key);
		return new Response();
	};

	@GET("/:bucket/")
	list: RouteHandler<Omit<DurableObjectStorageParams, "key">> = async (
		req,
		params
	) => {
		const persist = decodePersist(req.headers);
		const gateway = this.gatewayFactory.get(params.namespace, persist);
		await gateway.list();
		return new Response();
	};
}
