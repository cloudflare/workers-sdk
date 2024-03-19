import {
	Response as BaseResponse,
	ResponseInit as BaseResponseInit,
	BodyInit,
	ResponseRedirectStatus,
} from "undici";
import { WebSocket } from "./websocket";

export interface ResponseInit extends BaseResponseInit {
	webSocket?: WebSocket | null;
}

const kWebSocket = Symbol("kWebSocket");
export class Response extends BaseResponse {
	// We should be able to use a private `#webSocket` property here instead of a
	// symbol here, but `undici` calls `this.status` in its constructor, which
	// causes a "Cannot read private member from an object whose class did not
	// declare it" error.
	readonly [kWebSocket]: WebSocket | null;

	// Override BaseResponse's static methods for building Responses to return
	// our type instead. Ideally, we don't want to use `Object.setPrototypeOf`.
	// Unfortunately, `error()` and `redirect()` set the internal header guard
	// to "immutable".
	static error(): Response {
		const response = BaseResponse.error() as Response;
		Object.setPrototypeOf(response, Response.prototype);
		return response;
	}
	static redirect(url: string | URL, status: ResponseRedirectStatus): Response {
		const response = BaseResponse.redirect(url, status) as Response;
		Object.setPrototypeOf(response, Response.prototype);
		return response;
	}
	static json(data: any, init?: ResponseInit): Response {
		// https://fetch.spec.whatwg.org/#dom-response-json
		const body = JSON.stringify(data);
		const response = new Response(body, init);
		response.headers.set("Content-Type", "application/json");
		return response;
	}

	constructor(body?: BodyInit, init?: ResponseInit) {
		// Status 101 Switching Protocols would normally throw a RangeError, but we
		// need to allow it for WebSockets
		if (init?.webSocket) {
			if (init.status !== 101) {
				throw new RangeError(
					"Responses with a WebSocket must have status code 101."
				);
			}
			init = { ...init, status: 200 };
		}

		super(body, init);
		this[kWebSocket] = init?.webSocket ?? null;
	}

	// JSDoc comment so retained when bundling types with api-extractor
	/** @ts-expect-error `status` is actually defined as a getter internally */
	get status() {
		// When passing a WebSocket, we validate that the passed status was actually
		// 101, but we can't store this because `undici` rightfully complains.
		// @ts-expect-error `status` is actually defined as a method internally
		return this[kWebSocket] ? 101 : super.status;
	}

	get webSocket() {
		return this[kWebSocket];
	}

	// JSDoc comment so retained when bundling types with api-extractor
	/** @ts-expect-error `clone` is actually defined as a method internally */
	clone(): Response {
		if (this[kWebSocket]) {
			throw new TypeError("Cannot clone a response to a WebSocket handshake.");
		}
		// @ts-expect-error `clone` is actually defined as a method internally
		const response = super.clone() as Response;
		Object.setPrototypeOf(response, Response.prototype);
		return response;
	}
}
