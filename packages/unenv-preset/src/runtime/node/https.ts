// This hybrid polyfill is used only when the native implementation is not available
// See `src/preset.ts` for details

import {
	createServer as unenvCreateServer,
	Server as unenvServer,
} from "unenv/node/https";
import type nodeHttps from "node:https";

const workerdHttps = process.getBuiltinModule("node:https");

// Use the workerd implementation of server APIs when the
// `enable_nodejs_http_server_modules` flag is on.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const isWorkerdServerEnabled = (globalThis as any).Cloudflare.compatibilityFlags
	.enable_nodejs_http_server_modules;

export const createServer = isWorkerdServerEnabled
	? workerdHttps.createServer
	: unenvCreateServer;
export const Server = isWorkerdServerEnabled
	? workerdHttps.Server
	: unenvServer;
export const { Agent, globalAgent, request, get } = workerdHttps;

export default {
	Agent,
	// @ts-expect-error Node types do not match unenv
	createServer,
	get,
	globalAgent,
	request,
	Server,
} satisfies typeof nodeHttps;
