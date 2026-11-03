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
const identity = await env.IDENTITY.getIdentity("agent_17");
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

const namedIdentity = await env.IDENTITY.getIdentity({ agentId: "agent_17" });
const defaultIdentity = await env.IDENTITY.getIdentity({});
const agentToken: Promise<string> = namedIdentity.getToken();
const forwardedGrant: Promise<string> = forwarded.getAuthorizationGrant({
	authorizationServer: "https://auth.example",
	scope: ["read"],
});
void [defaultIdentity, agentToken, forwardedGrant];
// @ts-expect-error Saved connections are not implemented by workload bindings.
env.IDENTITY.getIdentity({ customerId: "acme", connectionId: "conn_1" });
// @ts-expect-error Agent selection does not accept a second positional argument.
env.IDENTITY.getIdentity("agent_17", { connectionId: "conn_1" });
// @ts-expect-error Forwarding fixes the actor and does not permit reselection.
forwarded.getIdentity("agent_18");
// @ts-expect-error Token issuance cannot select a different actor.
namedIdentity.getToken({ agentId: "agent_18" });

// The full API restriction matrix belongs to workerd's types/test/types/oidc.ts.
// This test covers the config inference and Service<Relay> mapping.
// @ts-expect-error Config inference must preserve selection before fetch.
void env.IDENTITY.fetch("https://api.example.com");

const metadata = await identity.getClientMetadata();
const clientId: string = metadata.client_id;
const assertion: string = await identity.getClientAssertion({
	clientId: "provider-id",
	audience: "https://auth.example",
});
void [clientId, assertion];

const algorithm: "ES256" | "Ed25519" = metadata.token_endpoint_auth_signing_alg;
const publicY: string | undefined = metadata.jwks.keys[0]?.y;
void [algorithm, publicY];
identity.getClientAssertion({
	clientId: "provider-id",
	audience: "https://auth.example",
	// @ts-expect-error The service chooses the client signing algorithm.
	algorithm: "ES256",
});
