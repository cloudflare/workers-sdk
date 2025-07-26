// TODO: use the workerd server implementation when available
// See https://github.com/cloudflare/workerd/pull/4591
import {
	_connectionListener,
	CloseEvent,
	createServer,
	maxHeaderSize,
	MessageEvent,
	Server,
	ServerResponse,
	setMaxIdleHTTPParsers,
	WebSocket,
} from "unenv/node/http";
import type nodeHttp from "node:http";

export {
	_connectionListener,
	CloseEvent,
	createServer,
	maxHeaderSize,
	MessageEvent,
	Server,
	ServerResponse,
	setMaxIdleHTTPParsers,
	WebSocket,
} from "unenv/node/http";

const workerdHttp = process.getBuiltinModule("node:http");

export const {
	Agent,
	ClientRequest,
	globalAgent,
	IncomingMessage,
	METHODS,
	OutgoingMessage,
	STATUS_CODES,
	validateHeaderName,
	validateHeaderValue,
	request,
	get,
} = workerdHttp;

export default {
	_connectionListener,
	Agent,
	ClientRequest,
	// @ts-expect-error Node types do not match unenv
	CloseEvent,
	// @ts-expect-error Node types do not match unenv
	createServer,
	get,
	globalAgent,
	IncomingMessage,
	maxHeaderSize,
	// @ts-expect-error Node types do not match unenv
	MessageEvent,
	METHODS,
	OutgoingMessage,
	request,
	Server,
	// @ts-expect-error Node types do not match unenv
	ServerResponse,
	// @ts-expect-error Node types do not match unenv
	setMaxIdleHTTPParsers,
	STATUS_CODES,
	validateHeaderName,
	validateHeaderValue,
	// @ts-expect-error Node types do not match unenv
	WebSocket,
} satisfies typeof nodeHttp;
