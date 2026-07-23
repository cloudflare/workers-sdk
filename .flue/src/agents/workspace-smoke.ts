import { defineAgent, type AgentRouteHandler } from "@flue/runtime";
import { bearerAuth } from "hono/bearer-auth";
import { HTTPException } from "hono/http-exception";
import {
	getDefaultWorkspace,
	getShellSandbox,
} from "../sandboxes/cloudflare-shell";
import type { Context } from "hono";

export const route: AgentRouteHandler = async (c, next) => {
	try {
		const middleware = bearerAuth({
			token: c.env.FLUE_EVALS_BEARER_TOKEN,
		});

		await middleware(c as unknown as Context, next);
	} catch (error) {
		if (error instanceof HTTPException) {
			return error.getResponse();
		}

		throw error;
	}
};

export default defineAgent<Env>(({ env }) => {
	const workspace = getDefaultWorkspace();

	return {
		instructions: `Use the code tool to inspect and update your durable workspace. When asked to verify the workspace, create a small file, read it back, and report the result concisely.`,
		model: "cloudflare/@cf/moonshotai/kimi-k2.6",
		sandbox: getShellSandbox({
			executor: {
				globalOutbound: null,
				timeout: 60_000,
			},
			loader: env.LOADER,
			workspace,
		}),
	};
});
