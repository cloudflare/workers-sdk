// Public Artifacts event messages, as documented at
// https://developers.cloudflare.com/artifacts/guides/event-subscriptions/

/** Event types Artifacts publishes to subscriptions. */
export const ARTIFACTS_EVENT_TYPES = [
	"cf.artifacts.repo.created",
	"cf.artifacts.repo.deleted",
	"cf.artifacts.repo.forked",
	"cf.artifacts.repo.imported",
	"cf.artifacts.repo.pushed",
	"cf.artifacts.repo.cloned",
	"cf.artifacts.repo.fetched",
	"cf.artifacts.repo.token.created",
	"cf.artifacts.repo.token.revoked",
] as const;

/** A published Artifacts event type. */
export type ArtifactsEventType = (typeof ARTIFACTS_EVENT_TYPES)[number];

/**
 * Account-level events are published to the `artifacts` source; the remaining
 * events are scoped to one repository through the `artifacts.repo` source.
 */
const ACCOUNT_EVENT_TYPES: ReadonlySet<ArtifactsEventType> = new Set([
	"cf.artifacts.repo.created",
	"cf.artifacts.repo.deleted",
	"cf.artifacts.repo.forked",
	"cf.artifacts.repo.imported",
]);

/** An Artifacts event source type. */
export type ArtifactsEventSourceType = "artifacts" | "artifacts.repo";

/**
 * Returns the subscription source that publishes an event type.
 *
 * @param type - Event type
 * @returns `artifacts` for account-level events, else `artifacts.repo`
 */
export function getArtifactsEventSourceType(
	type: ArtifactsEventType
): ArtifactsEventSourceType {
	return ACCOUNT_EVENT_TYPES.has(type) ? "artifacts" : "artifacts.repo";
}

/**
 * Returns every event type a subscription source publishes.
 *
 * @param source - Subscription source
 * @returns Event types published by the source
 */
export function getArtifactsEventTypesForSource(
	source: ArtifactsEventSourceType
): ArtifactsEventType[] {
	return ARTIFACTS_EVENT_TYPES.filter(
		(type) => getArtifactsEventSourceType(type) === source
	);
}

/** Repository state published in repository lifecycle events. */
export interface RepoPayload {
	repoId: string;
	defaultBranch: string;
	description: string | null;
	readOnly: boolean;
	createdAt: string;
	updatedAt: string;
	lastPushAt: string | null;
}

/** A Git author or committer. */
export interface GitIdentity {
	name: string;
	email: string;
}

/** A commit summarised in a push event. */
export interface PushedCommit {
	id: string;
	message: string;
	messageTruncated: boolean;
	timestamp: string;
	author: GitIdentity;
	committer: GitIdentity;
	parents: string[];
}

/** Payload of each published event type. */
export interface ArtifactsEventPayloads {
	"cf.artifacts.repo.created": RepoPayload;
	"cf.artifacts.repo.deleted": RepoPayload;
	"cf.artifacts.repo.forked": RepoPayload & {
		namespace: string;
		repoName: string;
	};
	"cf.artifacts.repo.imported": RepoPayload & {
		sourceUrl: string;
		branch: string | null;
	};
	"cf.artifacts.repo.pushed": {
		ref: string;
		before: string;
		after: string;
		commits: PushedCommit[];
		totalCommitsCount: number;
		commitsTruncated: boolean;
	};
	"cf.artifacts.repo.cloned": Record<string, never>;
	"cf.artifacts.repo.fetched": Record<string, never>;
	"cf.artifacts.repo.token.created": {
		tokenId: string;
		scope: string;
		expiresAt: string;
	};
	"cf.artifacts.repo.token.revoked": { tokenId: string };
}

/** The repository an event happened to. Forks name the source repository. */
export interface ArtifactsEventSource {
	type: ArtifactsEventSourceType;
	namespace: string;
	repoName: string;
}

/** An event before it is addressed to a subscription. */
export interface ArtifactsEvent<
	Type extends ArtifactsEventType = ArtifactsEventType,
> {
	type: Type;
	source: ArtifactsEventSource;
	payload: ArtifactsEventPayloads[Type];
	timestamp: string;
}

/** Delivery metadata added for each subscription. */
export interface ArtifactsEventMetadata {
	accountId: string;
	eventSubscriptionId: string;
	eventSchemaVersion: 1;
	eventTimestamp: string;
}

/** The message a Queue consumer or Workflow receives. */
export type ArtifactsEventMessage<
	Type extends ArtifactsEventType = ArtifactsEventType,
> = {
	[T in Type]: {
		type: T;
		source: ArtifactsEventSource;
		payload: ArtifactsEventPayloads[T];
		metadata: ArtifactsEventMetadata;
	};
}[Type];

/** Local development has no Cloudflare account. */
export const LOCAL_ACCOUNT_ID = "local";

/**
 * Creates an event happening now.
 *
 * @param type - Event type
 * @param repo - Repository the event happened to
 * @param payload - Event payload
 * @returns The event
 */
export function createArtifactsEvent<Type extends ArtifactsEventType>(
	type: Type,
	repo: { namespace: string; repoName: string },
	payload: ArtifactsEventPayloads[Type]
): ArtifactsEvent<Type> {
	return {
		type,
		source: { type: getArtifactsEventSourceType(type), ...repo },
		payload,
		timestamp: new Date().toISOString(),
	};
}

/**
 * Addresses an event to one subscription.
 *
 * @param event - Event to deliver
 * @param eventSubscriptionId - Subscription receiving the event
 * @returns The delivered message
 */
export function toArtifactsEventMessage<Type extends ArtifactsEventType>(
	event: ArtifactsEvent<Type>,
	eventSubscriptionId: string
): ArtifactsEventMessage {
	return {
		type: event.type,
		source: event.source,
		payload: event.payload,
		metadata: {
			accountId: LOCAL_ACCOUNT_ID,
			eventSubscriptionId,
			eventSchemaVersion: 1,
			eventTimestamp: event.timestamp,
		},
		// TypeScript can't correlate `type` and `payload` through the generic.
	} as ArtifactsEventMessage;
}

/** Where a subscription delivers events. */
export type ArtifactsEventTarget =
	| { type: "queue"; binding: string }
	| { type: "workflow"; binding: string };

/**
 * A subscription resolved for one local namespace. Subscriptions for other
 * namespaces are never passed to the namespace.
 */
export interface ArtifactsEventRoute {
	/** Stable local subscription identifier, used as `eventSubscriptionId`. */
	id: string;
	/** Event types to deliver; never empty. */
	types: ArtifactsEventType[];
	/** Restricts events to this repository, if set. */
	repoName?: string;
	target: ArtifactsEventTarget;
}

/**
 * Returns whether a route should receive an event.
 *
 * @param route - Subscription route
 * @param event - Published event
 * @returns Whether the event matches the route's types and repository
 */
export function matchesArtifactsEventRoute(
	route: ArtifactsEventRoute,
	event: ArtifactsEvent
): boolean {
	return (
		route.types.includes(event.type) &&
		(route.repoName === undefined || route.repoName === event.source.repoName)
	);
}
