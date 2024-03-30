import type {
	IncomingRequestCfProperties,
	RequestInitCfProperties,
} from "@cloudflare/workers-types/experimental";
import {
	Request as BaseRequest,
	RequestInfo as BaseRequestInfo,
	RequestInit as BaseRequestInit,
} from "undici";

export type RequestInitCfType =
	| Partial<IncomingRequestCfProperties>
	| RequestInitCfProperties;

export type RequestInfo = BaseRequestInfo | Request;

export interface RequestInit<
	CfType extends RequestInitCfType = RequestInitCfType,
> extends BaseRequestInit {
	cf?: CfType;
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
		super(input, init);
		this[kCf] = init?.cf;
		// Prefer `cf` from `init`, but if it's set on `input`, use that
		if (input instanceof Request) this[kCf] ??= input.cf;
	}

	get cf() {
		return this[kCf];
	}

	// JSDoc comment so retained when bundling types with api-extractor
	/** @ts-expect-error `clone` is actually defined as a method internally */
	clone(): Request<CfType> {
		// @ts-expect-error `clone` is actually defined as a method internally
		const request = super.clone() as Request<CfType>;
		// Update prototype so cloning a clone clones `cf`
		Object.setPrototypeOf(request, Request.prototype);
		request[kCf] = this[kCf];
		return request;
	}
}
