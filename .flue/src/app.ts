import { registerProvider } from "@flue/runtime";
import { flue } from "@flue/runtime/routing";
import { env } from "cloudflare:workers";
import { Hono } from "hono";

registerProvider("cloudflare", {
	api: "cloudflare-ai-binding",
	binding: env.AI,
	gateway: {
		collectLog: true,
		id: "default",
	},
});

export default new Hono().route("/", flue());
