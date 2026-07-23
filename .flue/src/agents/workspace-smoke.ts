import { defineAgent, type AgentRouteHandler } from "@flue/runtime";
import {
	getDefaultWorkspace,
	getShellSandbox,
} from "../sandboxes/cloudflare-shell";

export const route: AgentRouteHandler = async (_c, next) => next();

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
