import { bindings, defineWorker } from "../public";
import type { InferEnv } from "../public";
const policy = {
	connector_id: "a7e6a4e4-6666-4666-8666-123456789abc",
	connector_revision: 1 as const,
	selection: "customer" as const,
	scope: ["read"],
	resources: [{ url: "https://api.example/items", methods: ["GET" as const] }],
};
const config = defineWorker({
	name: "connections",
	compatibilityDate: "2026-10-30",
	env: {
		USE: bindings.identity(policy),
		MANAGE: bindings.identity({ ...policy, connection_management: true }),
	},
});
declare const env: InferEnv<typeof config>;
const handle = await env.USE.getIdentity({
	agentId: "agent-a",
	customerId: "customer-a",
	connectionId: "saved",
});
const id: Promise<string> = handle.dup().id;
const connectionId: Promise<string | null> = handle.dup().connectionId;
void [id, connectionId];
await env.MANAGE.beginConnection("customer-a", {
	sessionId: "session",
	returnTo: "https://app.example/complete",
});
// @ts-expect-error Management requires an explicit binding permission.
await env.USE.beginConnection("customer-a", {});
// @ts-expect-error Customer selection is named.
await env.USE.getIdentity("customer-a");
// @ts-expect-error Saved connections do not expose provider tokens.
await handle.getToken();
// @ts-expect-error Forwarded handles cannot reselect a connection.
await handle.getIdentity({ customerId: "other" });

const appConfig = defineWorker({
	name: "app",
	compatibilityDate: "2026-10-30",
	env: {
		APP: bindings.identity({
			...policy,
			selection: "app",
			connection_management: true,
		}),
		DEFAULT: bindings.identity({
			connector_id: policy.connector_id,
			connector_revision: 1,
			scope: policy.scope,
			resources: policy.resources,
		}),
	},
});
declare const app: InferEnv<typeof appConfig>;
await app.APP.getIdentity();
await app.APP.getIdentity("agent-a");
await app.APP.getIdentity({ agentId: "agent-a", connectionId: "saved" });
await app.APP.listConnections({ limit: 10 });
await app.APP.disableConnections();
await app.APP.enableConnections();
await env.MANAGE.removeConnection("customer-a", "saved");
await env.MANAGE.disconnectAll("customer-a");
await handle.getStatus();
// @ts-expect-error App bindings do not accept customer selectors.
await app.APP.getIdentity({ customerId: "customer-a" });
// @ts-expect-error Customer roots require a named owner.
await env.USE.getIdentity();
// @ts-expect-error Use-only roots cannot disable owners.
await env.USE.disableConnections("customer-a");
// @ts-expect-error Saved handles do not expose WAG issuance.
await handle.getAuthorizationGrant({
	authorizationServer: "https://auth.example",
});

const pending = await env.MANAGE.previewConnection("customer-a", {
	sessionId: "session",
	flowId: "flow",
	receipt: "receipt",
});
const issuer: string | undefined = pending.authorization.issuer;
const subject: string | undefined = pending.authorization.subject;
const scopeSource: "token_response" | "requested" | "unknown" =
	pending.authorization.scopeSource;
// @ts-expect-error Pending facts do not export provider credentials.
void pending.authorization.accessToken;
void [issuer, subject, scopeSource];
