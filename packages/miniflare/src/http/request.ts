import { Request as BaseRequest } from "undici";
import type {
	IncomingRequestCfProperties,
	RequestInitCfProperties,
} from "@cloudflare/workers-types/experimental";
import type {
	RequestInfo as BaseRequestInfo,
	RequestInit as BaseRequestInit,
} from "undici";

export type RequestInitCfType =
	| Partial<IncomingRequestCfProperties>
	| RequestInitCfProperties;

export type RequestInfo = BaseRequestInfo | Request | globalThis.Request;

export interface RequestInit<
	CfType extends RequestInitCfType = RequestInitCfType,
> extends BaseRequestInit {
	cf?: CfType;
}

/**
 * Node's global `Request` (and other cross-realm Requests) fail undici's brand
 * check, so `new undici.Request(globalRequest)` stringifies to
 * `"[object Request]"` and URL parsing throws. Detect Request-like values that
 * are not undici's `Request`.
 *
 * See https://github.com/cloudflare/workers-sdk/issues/15086
 */
function isForeignRequest(value: unknown): value is globalThis.Request {
	return (
		typeof value === "object" &&
		value !== null &&
		!(value instanceof BaseRequest) &&
		typeof (value as globalThis.Request).url === "string" &&
		typeof (value as globalThis.Request).method === "string" &&
		typeof (value as globalThis.Request).headers === "object" &&
		(value as globalThis.Request).headers !== null
	);
}

const kCf = Symbol("kCf");
export class Request<
	CfType extends RequestInitCfType = RequestInitCfType,
> extends BaseRequest {
	// We should be able to use a private `#cf` property here instead of a symbol
	// here, but we need to set this on a clone, which would otherwise lead to a
	// "Cannot write private member to an object whose class did not declare it"
	// error.
	[kCf]?: CfType;

	constructor(input: RequestInfo, init?: RequestInit<CfType>) {
		if (isForeignRequest(input)) {
			const body = input.body;
			super(input.url, {
				method: input.method,
				headers: input.headers,
				// undici requires `duplex` when a stream body is provided
				...(body != null ? { body, duplex: "half" as const } : {}),
				redirect: input.redirect,
				integrity: input.integrity,
				signal: input.signal,
				...init,
			});
			this[kCf] = init?.cf;
			if (this[kCf] === undefined && "cf" in input) {
				this[kCf] = (input as { cf?: CfType }).cf;
			}
		} else {
			super(input, init);
			this[kCf] = init?.cf;
			// Prefer `cf` from `init`, but if it's set on `input`, use that
			if (input instanceof Request) this[kCf] ??= input.cf;
		}
	}

	get cf() {
		return this[kCf];
	}

	clone(): Request<CfType> {
		const request = super.clone() as Request<CfType>;
		// Update prototype so cloning a clone clones `cf`
		Object.setPrototypeOf(request, Request.prototype);
		request[kCf] = this[kCf];
		return request;
	}
}
