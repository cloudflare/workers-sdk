import { Response } from "../../http";
import { POST, RouteHandler, Router, decodePersist } from "../shared";
import { D1Gateway, D1QuerySchema } from "./gateway";

export interface D1Params {
	database: string;
}

export class D1Router extends Router<D1Gateway> {
	@POST("/:database/query")
	query: RouteHandler<D1Params> = async (req, params) => {
		const persist = decodePersist(req.headers);
		const gateway = this.gatewayFactory.get(params.database, persist);
		const query = D1QuerySchema.parse(await req.json());
		const results = gateway.query(query);
		return Response.json(results);
	};

	@POST("/:database/execute")
	execute: RouteHandler<D1Params> = async (req, params) => {
		const persist = decodePersist(req.headers);
		const gateway = this.gatewayFactory.get(params.database, persist);
		const query = D1QuerySchema.parse(await req.json());
		const results = gateway.execute(query);
		return Response.json(results);
	};

	@POST("/:database/dump")
	dump: RouteHandler<D1Params> = async (req, params) => {
		const persist = decodePersist(req.headers);
		const gateway = this.gatewayFactory.get(params.database, persist);
		const buffer = await gateway.dump();
		return new Response(buffer, {
			headers: { "Content-Type": "application/octet-stream" },
		});
	};
}
