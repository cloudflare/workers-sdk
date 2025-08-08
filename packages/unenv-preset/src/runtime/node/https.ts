// This hybrid polyfill is used only when the native implementation is not available
// See `src/preset.ts` for details

import { createServer, Server } from "unenv/node/https";
import type nodeHttps from "node:https";

export { Server, createServer } from "unenv/node/https";

const workerdHttps = process.getBuiltinModule("node:https");

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
