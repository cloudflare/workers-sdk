import { Headers, Request, RequestInit } from "undici";
import {
	CfHeader,
	GET,
	PURGE,
	PUT,
	RouteHandler,
	Router,
	decodePersist,
} from "../shared";
import { HEADER_CACHE_WARN_USAGE } from "./constants";
import { fallible } from "./errors";
import { CacheGateway } from "./gateway";

export interface CacheParams {
	uri: string;
}

function decodeNamespace(headers: Headers) {
	const namespace = headers.get(CfHeader.CacheNamespace);
	// Namespace separator `:` will become a new directory when using file-system
	// backed persistent storage
	return namespace === null ? `default` : `named:${namespace}`;
}

export class CacheRouter extends Router<CacheGateway> {
	#warnedUsage = false;
	#maybeWarnUsage(headers: Headers) {
		if (!this.#warnedUsage && headers.get(HEADER_CACHE_WARN_USAGE) === "true") {
			this.#warnedUsage = true;
			this.log.warn(
				"Cache operations will have no impact if you deploy to a workers.dev subdomain!"
			);
		}
	}

	@GET("/:uri")
	match: RouteHandler<CacheParams> = async (req, params) => {
		this.#maybeWarnUsage(req.headers);
		const uri = decodeURIComponent(params.uri);
		const namespace = decodeNamespace(req.headers);
		const persist = decodePersist(req.headers);
		const gateway = this.gatewayFactory.get(namespace, persist);
		return fallible(gateway.match(new Request(uri, req as RequestInit)));
	};

	@PUT("/:uri")
	put: RouteHandler<CacheParams> = async (req, params) => {
		this.#maybeWarnUsage(req.headers);
		const uri = decodeURIComponent(params.uri);
		const namespace = decodeNamespace(req.headers);
		const persist = decodePersist(req.headers);
		const gateway = this.gatewayFactory.get(namespace, persist);
		return fallible(
			gateway.put(new Request(uri, req as RequestInit), await req.arrayBuffer())
		);
	};

	@PURGE("/:uri")
	delete: RouteHandler<CacheParams> = async (req, params) => {
		this.#maybeWarnUsage(req.headers);
		const uri = decodeURIComponent(params.uri);
		const namespace = decodeNamespace(req.headers);
		const persist = decodePersist(req.headers);
		const gateway = this.gatewayFactory.get(namespace, persist);
		return fallible(gateway.delete(new Request(uri, req as RequestInit)));
	};
}
