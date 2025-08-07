// This hybrid polyfill is used only when the native implementation is not available
// See `src/preset.ts` for details

import type nodeHttps from "node:https";

const workerdHttps = process.getBuiltinModule("node:https");

export const { Agent, globalAgent, request, get, Server, createServer } =
	workerdHttps;

export default {
	Agent,
	createServer,
	get,
	globalAgent,
	request,
	Server,
} satisfies typeof nodeHttps;
