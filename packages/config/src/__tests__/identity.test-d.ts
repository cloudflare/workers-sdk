import { WorkerEntrypoint } from "cloudflare:workers";
import { bindings, defineWorker } from "../public";
import type { InferEnv } from "../public";

const config = defineWorker({
	name: "signed-fetch",
	compatibilityDate: "2026-10-31",
	env: {
		IDENTITY: bindings.identity({
			request_signing: {
				allowed_origins: ["https://api.example.com"],
				allowed_methods: ["GET", "POST"],
			},
		}),
	},
});

declare const env: InferEnv<typeof config>;
const identity = await env.IDENTITY.getIdentity("customer-x");
type SelectedIdentity = Awaited<ReturnType<typeof env.IDENTITY.getIdentity>>;
class IdentityRelay extends WorkerEntrypoint {
	relay(selected: SelectedIdentity): SelectedIdentity {
		return selected.dup();
	}
}
declare const relay: Service<IdentityRelay>;
const forwarded = await relay.relay(identity);
const remoteId: Promise<string> = forwarded.id;
const remoteResponse: Promise<Response> = forwarded.fetch(
	"https://api.example.com"
);
void [remoteId, remoteResponse];

// The full API restriction matrix belongs to workerd's types/test/types/oidc.ts.
// This test covers the config inference and Service<Relay> mapping.
// @ts-expect-error Config inference must preserve selection before fetch.
void env.IDENTITY.fetch("https://api.example.com");
