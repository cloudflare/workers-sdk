import { Response } from "undici";
import {
	DELETE,
	GET,
	PUT,
	RouteHandler,
	Router,
	decodePersist,
} from "../shared";
import { R2Gateway } from "./gateway";

export interface R2Params {
	bucket: string;
	key: string;
}
export class R2Router extends Router<R2Gateway> {
	@GET("/:bucket/:key")
	get: RouteHandler<R2Params> = async (req, params) => {
		// console.log(await req.json());

		const persist = decodePersist(req.headers);
		const gateway = this.gatewayFactory.get(params.bucket, persist);
		await gateway.get(params.key);
		return new Response();
	};

	@PUT("/:bucket/:key")
	put: RouteHandler<R2Params> = async (req, params) => {
		const persist = decodePersist(req.headers);
		const gateway = this.gatewayFactory.get(params.bucket, persist);
		await gateway.put(params.key, new Uint8Array(await req.arrayBuffer()));
		return new Response();
	};

	@DELETE("/:bucket/:key")
	delete: RouteHandler<R2Params> = async (req, params) => {
		const persist = decodePersist(req.headers);
		const gateway = this.gatewayFactory.get(params.bucket, persist);
		await gateway.delete(params.key);
		return new Response();
	};

	@GET("/:bucket/")
	list: RouteHandler<Omit<R2Params, "key">> = async (req, params) => {
		const persist = decodePersist(req.headers);
		const gateway = this.gatewayFactory.get(params.bucket, persist);
		await gateway.list();
		return new Response();
	};
}
