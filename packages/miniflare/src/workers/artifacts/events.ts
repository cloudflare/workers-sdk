// Public Artifacts event messages, as documented at
// https://developers.cloudflare.com/artifacts/guides/event-subscriptions/

import type { ArtifactsEventType } from "@cloudflare/config/public";

export type { ArtifactsEventType };

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

/** The message a Workflow receives. */
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

/** The object ID Git reports for a ref that did not exist, or no longer does. */
export const ZERO_OID = "0".repeat(40);

/** A push event lists at most this many commits, as in production. */
export const MAX_PUSH_COMMITS = 20;

/** Commit messages in push events are cut to this many UTF-8 bytes. */
const MAX_COMMIT_MESSAGE_BYTES = 4096;

/** One ref a push changed. */
export interface RefUpdate {
	ref: string;
	/** The ref's previous target, or {@link ZERO_OID} when it was created. */
	before: string;
	/** The ref's new target, or {@link ZERO_OID} when it was deleted. */
	after: string;
}

/**
 * Lists the refs that differ between two snapshots, in ref order.
 *
 * @param before - Refs before the push, by name
 * @param after - Refs after the push, by name
 * @returns One update per created, moved, or deleted ref
 */
export function getRefUpdates(
	before: Record<string, string>,
	after: Record<string, string>
): RefUpdate[] {
	const refs = [...new Set([...Object.keys(before), ...Object.keys(after)])];
	return refs
		.sort()
		.map((ref) => ({
			ref,
			before: before[ref] ?? ZERO_OID,
			after: after[ref] ?? ZERO_OID,
		}))
		.filter((update) => update.before !== update.after);
}

/**
 * Whether a push event lists commits. As in production, only branch updates
 * that leave the branch in place do; tags and deletions list none.
 */
export function listsPushedCommits(update: RefUpdate): boolean {
	return update.after !== ZERO_OID && update.ref.startsWith("refs/heads/");
}

/** A commit as the local Git backend reads it. */
export interface BackendCommit {
	hash: string;
	message: string;
	author: GitIdentity;
	committer: GitIdentity;
	parents: string[];
	/** Committer time, in seconds since the epoch. */
	committedAt: number;
}

/**
 * The commits a push added to a branch, newest first, along its first-parent
 * chain from `after` back to (excluding) `before`.
 */
export interface CommitRange {
	/** At most {@link MAX_PUSH_COMMITS} commits. */
	commits: BackendCommit[];
	/**
	 * Commits walked. Production stops one past the listed limit, so this is
	 * at most `MAX_PUSH_COMMITS + 1` and only shows that commits were left out.
	 */
	totalCount: number;
}

/**
 * Builds a push event payload.
 *
 * @param update - The ref the push changed
 * @param range - Commits the push added, for branch updates
 * @returns The `cf.artifacts.repo.pushed` payload
 */
export function createPushedPayload(
	update: RefUpdate,
	range: CommitRange = { commits: [], totalCount: 0 }
): ArtifactsEventPayloads["cf.artifacts.repo.pushed"] {
	const commits = range.commits.slice(0, MAX_PUSH_COMMITS).map(toPushedCommit);
	return {
		ref: update.ref,
		before: update.before,
		after: update.after,
		commits,
		totalCommitsCount: range.totalCount,
		commitsTruncated: commits.length < range.totalCount,
	};
}

function toPushedCommit(commit: BackendCommit): PushedCommit {
	const message = truncateUtf8(commit.message, MAX_COMMIT_MESSAGE_BYTES);
	return {
		id: commit.hash,
		message: message.value,
		messageTruncated: message.truncated,
		timestamp: new Date(commit.committedAt * 1000).toISOString(),
		author: commit.author,
		committer: commit.committer,
		parents: commit.parents,
	};
}

/** Cuts text to at most `maxBytes` UTF-8 bytes without splitting a character. */
function truncateUtf8(
	value: string,
	maxBytes: number
): { value: string; truncated: boolean } {
	const encoded = new TextEncoder().encode(value);
	if (encoded.length <= maxBytes) {
		return { value, truncated: false };
	}
	let end = maxBytes;
	// Back up over continuation bytes to the start of the cut character.
	while (end > 0 && ((encoded[end] ?? 0) & 0xc0) === 0x80) {
		end--;
	}
	return {
		value: new TextDecoder().decode(encoded.subarray(0, end)),
		truncated: true,
	};
}

/** Event types a Git upload-pack request can publish. */
export type UploadPackEventType =
	| "cf.artifacts.repo.cloned"
	| "cf.artifacts.repo.fetched";

/**
 * Classifies a Git upload-pack request body the way production does: a
 * request that names objects the client already has is a fetch, one that
 * names none is a clone, and protocol v2 ref discovery (`ls-refs`) is
 * neither.
 *
 * @param body - Uncompressed request body, in Git pkt-line format
 * @returns The event type to publish, or `undefined` for none
 */
export function getUploadPackEventType(
	body: Uint8Array
): UploadPackEventType | undefined {
	const lines = readPktLines(body);
	if (lines === undefined || lines.includes("command=ls-refs")) {
		return undefined;
	}
	if (!lines.some((line) => line.startsWith("want "))) {
		return undefined;
	}
	return lines.some((line) => line.startsWith("have "))
		? "cf.artifacts.repo.fetched"
		: "cf.artifacts.repo.cloned";
}

/** Decodes pkt-lines, without trailing newlines; `undefined` if malformed. */
function readPktLines(body: Uint8Array): string[] | undefined {
	const decoder = new TextDecoder();
	const lines: string[] = [];
	let offset = 0;
	while (offset + 4 <= body.length) {
		const length = Number.parseInt(
			decoder.decode(body.subarray(offset, offset + 4)),
			16
		);
		if (!Number.isInteger(length)) {
			return undefined;
		}
		// 0000-0002 are flush, delimiter and response-end packets with no data.
		if (length < 4) {
			offset += 4;
			continue;
		}
		if (offset + length > body.length) {
			return undefined;
		}
		lines.push(
			decoder
				.decode(body.subarray(offset + 4, offset + length))
				.replace(/\n$/, "")
		);
		offset += length;
	}
	return lines;
}

/** Where a subscription delivers events. */
export interface ArtifactsEventTarget {
	type: "workflow";
	binding: string;
}

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
	return routeReceives(route, event.type, event.source.repoName);
}

/**
 * Returns whether a route receives an event type from a repository. Lets
 * callers skip building an event that no subscription would receive.
 *
 * @param route - Subscription route
 * @param type - Event type
 * @param repoName - Repository the event would come from
 * @returns Whether the route matches the type and repository
 */
export function routeReceives(
	route: ArtifactsEventRoute,
	type: ArtifactsEventType,
	repoName: string
): boolean {
	return (
		route.types.includes(type) &&
		// Match repository lookup identity without changing the published spelling.
		(route.repoName === undefined ||
			route.repoName.toLowerCase() === repoName.toLowerCase())
	);
}
