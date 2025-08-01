import {
	_connectionListener,
	CloseEvent,
	maxHeaderSize,
	MessageEvent,
	setMaxIdleHTTPParsers,
	createServer as unenvCreateServer,
	Server as unenvServer,
	ServerResponse as unenvServerResponse,
	WebSocket,
} from "unenv/node/http";
import type nodeHttp from "node:http";

export {
	_connectionListener,
	CloseEvent,
	maxHeaderSize,
	MessageEvent,
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

// Use the workerd implementation of server APIs when the
// `enable_nodejs_http_server_modules` flag is on.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const isWorkerdServerEnabled = (globalThis as any).Cloudflare.compatibilityFlags
	.enable_nodejs_http_server_modules;

export const createServer = isWorkerdServerEnabled
	? workerdHttp.createServer
	: unenvCreateServer;
export const Server = isWorkerdServerEnabled ? workerdHttp.Server : unenvServer;
export const ServerResponse = isWorkerdServerEnabled
	? workerdHttp.ServerResponse
	: unenvServerResponse;

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
