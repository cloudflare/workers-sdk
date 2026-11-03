import type { IdentityBindingConfig } from "@cloudflare/workers-utils/oidc";

// Structural fallbacks keep type generation usable before workers-types publishes the draft.
const WORKLOAD_TYPE =
	"{ getIdentity(selection?: string | { agentId?: string }): Promise<Rpc.Stub<Rpc.RpcTargetBranded & { getToken(): Promise<string>; getAuthorizationGrant(options: { authorizationServer: string; scope?: string[] }): Promise<string>; getClientMetadata(clientId?: string): Promise<{ client_id: string; client_name: string; token_endpoint_auth_method: 'private_key_jwt'; token_endpoint_auth_signing_alg: 'Ed25519' | 'ES256'; jwks: { keys: { kty: string; crv?: string; x?: string; kid?: string; alg?: string; use?: string }[] }; grant_types: 'client_credentials'[]; response_types: never[] }>; getClientAssertion(options: { clientId: string; audience: string }): Promise<string>; readonly id: Promise<string>; readonly signatureAgent: Promise<string>; readonly directoryURL: Promise<string>; fetch(input: Request | string, init?: Omit<RequestInit, 'body' | 'cf' | 'signal'> & { body?: string | ArrayBuffer | ArrayBufferView | ReadableStream<Uint8Array> | Blob }): Promise<Response> }>>; getToken(): Promise<string>; getAuthorizationGrant(options: { authorizationServer: string; scope?: string[] }): Promise<string> }";
const fetchMethod =
	"fetch(input: Request | string, init?: Omit<RequestInit, 'body' | 'cf' | 'signal'> & { body?: string | ArrayBuffer | ArrayBufferView | ReadableStream<Uint8Array> | Blob }): Promise<Response>";
const cleanupState = "'complete' | 'pending' | 'unsupported' | 'unknown'";
const cleanup = `{ revocationPending: boolean; providerCleanup: ${cleanupState} }`;
const completion = "{ sessionId: string; flowId: string; receipt: string }";
const status = `{ connectionId: string | null; state: 'consent_required' | 'default_required' | 'pending' | 'ready' | 'disconnected' | 'reconnect_required' | 'scope_incompatible' | 'owner_disabled' | 'connector_deleted' | 'connection_removed' | 'superseded'; observedAt: number; grantedScopes: string[] | null; scopeSource: 'token_response' | 'requested' | 'unknown'; providerCleanup: ${cleanupState} | null }`;
const pending =
	"{ connectionId: string; flowId: string; expiresAt: number; scopes: string[]; authorization: { issuer?: string; subject?: string; scopeSource: 'token_response' | 'requested' | 'unknown' } }";
const stub = (fields: string) =>
	`Rpc.Stub<Rpc.RpcTargetBranded & { ${fields} }>`;

export function getIdentityBindingType(binding: IdentityBindingConfig): string {
	const saved =
		"connector_id" in binding ||
		(binding.oauth &&
			"grant" in binding.oauth &&
			binding.oauth.grant === "authorization_code");
	if (!saved) {
		return WORKLOAD_TYPE;
	}
	const customer = "selection" in binding && binding.selection === "customer";
	const prefix = customer ? "customerId: string, " : "";
	const owner = customer ? "customerId: string" : "";
	const selector =
		"{ agentId?: string; connectionId?: string" +
		(customer ? "; customerId: string" : "") +
		" }";
	const selected = stub(
		`${fetchMethod}; readonly id: string; readonly connectionId: string | null; getStatus(): Promise<${status}>`
	);
	const use = `getIdentity(${customer ? "selection: " + selector : "selection?: string | " + selector}): Promise<${selected}>; listConnections(${prefix}options?: { cursor?: string; limit?: number }): Promise<{ connections: ${status}[]; defaultConnectionId: string | null; defaultInitialized: boolean; nextCursor: string | null }>`;
	if (!("connection_management" in binding && binding.connection_management)) {
		return `{ ${use} }`;
	}
	return `{ ${use};
 beginConnection(${prefix}options: { sessionId: string; returnTo: string; connectionId?: string }): Promise<{ connectionId: string; flowId: string; expiresAt: number; authorizationUrl: string }>;
 previewConnection(${prefix}completion: ${completion}): Promise<${pending}>;
 getPendingIdentity(${prefix}completion: ${completion}): Promise<${stub(fetchMethod)}>;
 completeConnection(${prefix}completion: ${completion}): Promise<{ connectionId: string; generation: string; status: 'ready' }>;
 cancelConnection(${prefix}completion: ${completion}): Promise<${cleanup}>;
 setDefaultConnection(${prefix}connectionId: string): Promise<void>;
 disconnect(${prefix}connectionId: string): Promise<${cleanup}>;
 removeConnection(${prefix}connectionId: string): Promise<${cleanup}>;
 disconnectAll(${owner}): Promise<${cleanup}>;
 disableConnections(${owner}): Promise<${cleanup}>;
 enableConnections(${owner}): Promise<void>;
 }`;
}
