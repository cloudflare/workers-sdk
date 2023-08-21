import assert from "assert";
import { Headers, Response } from "../../http";
import {
	DELETE,
	GET,
	PUT,
	RouteHandler,
	Router,
	decodePersist,
} from "../shared";
import {
	HEADER_EXPIRATION,
	HEADER_METADATA,
	HEADER_SITES,
	PARAM_CACHE_TTL,
	PARAM_EXPIRATION,
	PARAM_EXPIRATION_TTL,
	PARAM_LIST_CURSOR,
	PARAM_LIST_LIMIT,
	PARAM_LIST_PREFIX,
	PARAM_URL_ENCODED,
} from "./constants";
import {
	KVError,
	KVGateway,
	KVGatewayGetOptions,
	KVGatewayGetResult,
	KVGatewayListOptions,
	KVGatewayListResult,
} from "./gateway";
import { sitesGatewayGet, sitesGatewayList } from "./sites";

export interface KVParams {
	namespace: string;
	key: string;
}

function decodeKey({ key }: Pick<KVParams, "key">, query: URLSearchParams) {
	if (query.get(PARAM_URL_ENCODED)?.toLowerCase() !== "true") return key;
	try {
		return decodeURIComponent(key);
	} catch (e: any) {
		if (e instanceof URIError) {
			throw new KVError(400, "Could not URL-decode key name");
		} else {
			throw e;
		}
	}
}

export class KVRouter extends Router<KVGateway> {
	@GET("/:namespace/:key")
	get: RouteHandler<KVParams> = async (req, params, url) => {
		// Get gateway with (persistent) storage
		const persist = decodePersist(req.headers);
		const namespace = decodeURIComponent(params.namespace);

		// Decode URL parameters
		const key = decodeKey(params, url.searchParams);
		const cacheTtlParam = url.searchParams.get(PARAM_CACHE_TTL);
		const options: KVGatewayGetOptions = {
			cacheTtl: cacheTtlParam === null ? undefined : parseInt(cacheTtlParam),
		};

		// Get value from storage
		let value: KVGatewayGetResult | undefined;
		const siteRegExps = req.headers.get(HEADER_SITES);
		if (siteRegExps === null) {
			const gateway = this.gatewayFactory.get(namespace, persist);
			value = await gateway.get(key, options);
		} else {
			// Workers Sites: if this is a sites request, persist should be used as
			// the root without any additional namespace
			value = await sitesGatewayGet(persist, siteRegExps, key, options);
		}
		if (value === undefined) throw new KVError(404, "Not Found");

		// Return value in runtime-friendly format
		const headers = new Headers();
		if (value.expiration !== undefined) {
			headers.set(HEADER_EXPIRATION, value.expiration.toString());
		}
		if (value.metadata !== undefined) {
			headers.set(HEADER_METADATA, JSON.stringify(value.metadata));
		}
		return new Response(value.value, { headers });
	};

	@PUT("/:namespace/:key")
	put: RouteHandler<KVParams> = async (req, params, url) => {
		// Get gateway with (persistent) storage
		const persist = decodePersist(req.headers);
		const namespace = decodeURIComponent(params.namespace);
		const gateway = this.gatewayFactory.get(namespace, persist);

		// Decode URL parameters
		const key = decodeKey(params, url.searchParams);
		const expiration = url.searchParams.get(PARAM_EXPIRATION) ?? undefined;
		const expirationTtl =
			url.searchParams.get(PARAM_EXPIRATION_TTL) ?? undefined;

		// Parse metadata if set
		const metadataHeader = req.headers.get(HEADER_METADATA);
		const metadata =
			metadataHeader === null ? undefined : JSON.parse(metadataHeader);

		// Put value into storage
		const value = req.body;
		assert(value !== null);

		// If we know the value length, avoid passing the body through a transform
		// stream to count it (trusting `workerd` to send correct value here).
		// Safety of `!`: `parseInt(null)` is `NaN`
		const contentLength = parseInt(req.headers.get("Content-Length")!);
		const valueLengthHint = Number.isNaN(contentLength)
			? undefined
			: contentLength;

		await gateway.put(key, value, {
			expiration,
			expirationTtl,
			metadata,
			valueLengthHint,
		});

		return new Response();
	};

	@DELETE("/:namespace/:key")
	delete: RouteHandler<KVParams> = async (req, params, url) => {
		// Get gateway with (persistent) storage
		const persist = decodePersist(req.headers);
		const namespace = decodeURIComponent(params.namespace);
		const gateway = this.gatewayFactory.get(namespace, persist);

		// Decode URL parameters
		const key = decodeKey(params, url.searchParams);

		// Delete key from storage
		await gateway.delete(key);
		return new Response();
	};

	@GET("/:namespace/")
	list: RouteHandler<Omit<KVParams, "key">> = async (req, params, url) => {
		// Get gateway with (persistent) storage
		const persist = decodePersist(req.headers);
		const namespace = decodeURIComponent(params.namespace);

		// Decode URL parameters
		const limitParam = url.searchParams.get(PARAM_LIST_LIMIT);
		const limit = limitParam === null ? undefined : parseInt(limitParam);
		const prefix = url.searchParams.get(PARAM_LIST_PREFIX) ?? undefined;
		const cursor = url.searchParams.get(PARAM_LIST_CURSOR) ?? undefined;
		const options: KVGatewayListOptions = { limit, prefix, cursor };

		// List keys from storage
		let result: KVGatewayListResult;
		const siteRegExps = req.headers.get(HEADER_SITES);
		if (siteRegExps === null) {
			const gateway = this.gatewayFactory.get(namespace, persist);
			result = await gateway.list(options);
		} else {
			// Workers Sites: if this is a sites request, persist should be used as
			// the root without any additional namespace
			result = await sitesGatewayList(persist, siteRegExps, options);
		}
		return Response.json(result);
	};
}
