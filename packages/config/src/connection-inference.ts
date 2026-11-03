/** Runtime connection observations contain no provider account labels or credentials. */
export interface ConnectionStatus {
	connectionId: string | null;
	state:
		| "consent_required"
		| "default_required"
		| "pending"
		| "ready"
		| "disconnected"
		| "reconnect_required"
		| "scope_incompatible"
		| "owner_disabled"
		| "connector_deleted"
		| "connection_removed"
		| "superseded";
	observedAt: number;
	grantedScopes: string[] | null;
	scopeSource: "token_response" | "requested" | "unknown";
	providerCleanup: ProviderCleanup | null;
}
type ProviderCleanup = "complete" | "pending" | "unsupported" | "unknown";
interface CleanupResult {
	revocationPending: boolean;
	providerCleanup: ProviderCleanup;
}
interface Completion {
	sessionId: string;
	flowId: string;
	receipt: string;
}
interface PendingConnection {
	connectionId: string;
	flowId: string;
	expiresAt: number;
	scopes: string[];
}
interface ConnectionFlow {
	connectionId: string;
	flowId: string;
	expiresAt: number;
	authorizationUrl: string;
}
interface ConnectionPage {
	connections: ConnectionStatus[];
	defaultConnectionId: string | null;
	defaultInitialized: boolean;
	nextCursor: string | null;
}
type Prefix<T> = T extends { selection: "customer" }
	? [customerId: string]
	: [];
type Selection = { agentId?: string; connectionId?: string };
type FetchIdentity<Properties = object> = Rpc.Stub<
	Rpc.RpcTargetBranded &
		Properties & {
			fetch(
				input: Request | string,
				init?: Omit<RequestInit, "cf" | "signal">
			): Promise<Response>;
		}
>;
type SavedIdentity = FetchIdentity<{
	readonly id: string;
	readonly connectionId: string | null;
	getStatus(): Promise<ConnectionStatus>;
}>;
type ConnectionUse<T> = {
	listConnections(
		...args: [...Prefix<T>, options?: { cursor?: string; limit?: number }]
	): Promise<ConnectionPage>;
} & (T extends { selection: "customer" }
	? {
			getIdentity(
				selection: Selection & { customerId: string }
			): Promise<SavedIdentity>;
		}
	: {
			getIdentity(): Promise<SavedIdentity>;
			getIdentity(agentId: string): Promise<SavedIdentity>;
			getIdentity(selection: Selection): Promise<SavedIdentity>;
		});
interface ConnectionManagement<T> {
	beginConnection(
		...args: [
			...Prefix<T>,
			options: { sessionId: string; returnTo: string; connectionId?: string },
		]
	): Promise<ConnectionFlow>;
	previewConnection(
		...args: [...Prefix<T>, completion: Completion]
	): Promise<PendingConnection>;
	getPendingIdentity(
		...args: [...Prefix<T>, completion: Completion]
	): Promise<FetchIdentity>;
	completeConnection(
		...args: [...Prefix<T>, completion: Completion]
	): Promise<{ connectionId: string; generation: string; status: "ready" }>;
	cancelConnection(
		...args: [...Prefix<T>, completion: Completion]
	): Promise<CleanupResult>;
	setDefaultConnection(
		...args: [...Prefix<T>, connectionId: string]
	): Promise<void>;
	disconnect(
		...args: [...Prefix<T>, connectionId: string]
	): Promise<CleanupResult>;
	removeConnection(
		...args: [...Prefix<T>, connectionId: string]
	): Promise<CleanupResult>;
	disconnectAll(...args: Prefix<T>): Promise<CleanupResult>;
	disableConnections(...args: Prefix<T>): Promise<CleanupResult>;
	enableConnections(...args: Prefix<T>): Promise<void>;
}
export type InferredConnectionBinding<T> = ConnectionUse<T> &
	(T extends { connection_management: true }
		? ConnectionManagement<T>
		: object);
