import { registerProvider } from "@flue/runtime";
import { flue } from "@flue/runtime/routing";
import { env } from "cloudflare:workers";
import { Hono } from "hono";
import { bearerAuth } from "hono/bearer-auth";

registerProvider("cloudflare", {
	api: "cloudflare-ai-binding",
	binding: env.AI,
	gateway: {
		collectLog: true,
		id: "default",
	},
});

export default new Hono()
	.use(
		"/agents/*",
		bearerAuth({
			token: env.FLUE_EVALS_BEARER_TOKEN,
		})
	)
	.route("/", flue());
