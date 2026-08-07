import { setProvider } from "@flue/runtime";
import { cloudflareBindingProvider } from "@flue/runtime/cloudflare/workers-ai";
import { env } from "cloudflare:workers";
import { Hono } from "hono";
import { channel as githubChannel } from "./channels/github";

setProvider(
	cloudflareBindingProvider({
		binding: env.AI,
		gateway: {
			id: "default",
		},
	})
);

const app = new Hono()
	// Channels
	.route("/channels/github", githubChannel.route());

export default {
	fetch: app.fetch,
} satisfies ExportedHandler<Env>;
