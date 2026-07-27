import { setProvider } from "@flue/runtime";
import { cloudflareBindingProvider } from "@flue/runtime/cloudflare/workers-ai";
import { env } from "cloudflare:workers";
import { Hono } from "hono";
import { channel as github } from "./channels/github";

setProvider(
	cloudflareBindingProvider({
		binding: env.AI,
		gateway: {
			id: "default",
		},
	})
);

const app = new Hono().route("/channels/github", github.route());

// Triage agents are driven by verified GitHub events and should remain
// dispatch-only unless a future feature has a specific authenticated HTTP use.

export default app;
