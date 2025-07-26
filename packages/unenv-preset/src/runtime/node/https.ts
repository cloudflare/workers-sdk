import { createServer, Server } from "unenv/node/https";
import type nodeHttps from "node:https";

// TODO: use the workerd implementation when available
// See https://github.com/cloudflare/workerd/pull/4591
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
