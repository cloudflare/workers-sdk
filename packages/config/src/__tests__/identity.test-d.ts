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
const defaultIdentity = await env.IDENTITY.getIdentity();
const selectedId: string = await identity.id;
const pendingId: Promise<string> = identity.id;
const response: Promise<Response> = identity.fetch("https://api.example.com", {
	method: "POST",
	body: "hello",
});
void [defaultIdentity, selectedId, pendingId, response];

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

// @ts-expect-error A newly selected target property requires an RPC await.
const unawaitedSelectedId: string = identity.id;
void unawaitedSelectedId;
// @ts-expect-error URL is not an RPC-serializable input; normalize with Request.
void identity.fetch(new URL("https://api.example.com"));
void identity.fetch(new Request(new URL("https://api.example.com")));
void identity.fetch("https://api.example.com", {
	method: "POST",
	// @ts-expect-error FormData must be normalized into Request before RPC.
	body: new FormData(),
});
void identity.fetch("https://api.example.com", {
	method: "POST",
	// @ts-expect-error URLSearchParams must be normalized into Request before RPC.
	body: new URLSearchParams(),
});
void identity.fetch("https://api.example.com", {
	// @ts-expect-error Routing overrides are not accepted.
	cf: { resolveOverride: "other.example" },
});
// @ts-expect-error A forwarded target property requires an RPC await.
const unawaitedId: string = forwarded.id;
void unawaitedId;
// @ts-expect-error The fetcher fixes its identity and exposes no nested selector.
void identity.getIdentity("other");
// @ts-expect-error Minted fetchers expose no token issuance.
void identity.getToken();
// @ts-expect-error Metadata is readonly.
identity.id = "forged";
// @ts-expect-error Select only an optional label, never authority overrides.
void env.IDENTITY.getIdentity({ label: "customer-x", accountId: "forged" });
