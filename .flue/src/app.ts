import { setProvider } from "@flue/runtime";
import { cloudflareBindingProvider } from "@flue/runtime/cloudflare/workers-ai";
import { createAgentRouter } from "@flue/runtime/routing";
import { env } from "cloudflare:workers";
import { Hono } from "hono";
import { bearerAuth } from "hono/bearer-auth";
import { WorkspaceSmoke } from "./agents/workspace-smoke";
import { channel as github } from "./channels/github";

setProvider(
	cloudflareBindingProvider({
		binding: env.AI,
		gateway: {
			id: "default",
		},
	})
);

const app = new Hono()
	.use(
		"/agents/*",
		bearerAuth({
			token: env.FLUE_BEARER_TOKEN,
		})
	)
	.route("/agents/workspace-smoke", createAgentRouter(WorkspaceSmoke))
	.route("/channels/github", github.route());

export default app;
