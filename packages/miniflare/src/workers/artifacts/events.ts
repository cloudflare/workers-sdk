/** Local Artifacts repository snapshot used in canonical lifecycle events. */
export interface RepoSnapshot {
	id: string;
	namespace: string;
	name: string;
	jurisdiction: "unrestricted";
	defaultBranch: string;
	description: string | null;
	readOnly: boolean;
	createdAt: string;
	updatedAt: string;
	lastPushAt: string | null;
}

type NamespaceSnapshot = {
	name: string;
	jurisdiction: "unrestricted";
	createdAt: string;
	updatedAt: string;
};
type RepoLocality = { namespace: string; name: string };
type GitIdentity = { name: string; email: string };
type PushCommit = {
	id: string;
	message: string;
	messageTruncated: boolean;
	timestamp: string;
	author: GitIdentity;
	committer: GitIdentity;
	parents: string[];
};
type Push = {
	ref: string;
	before: string;
	after: string;
	commits: PushCommit[];
	totalCommitsCount: number;
	commitsTruncated: boolean;
};

type TransportEventType =
	| "repo.pushed.v1"
	| "repo.cloned.v1"
	| "repo.fetched.v1"
	| "repo.size_observed.v1";

type Event<Type extends string, Payload> = {
	envelopeVersion: 1;
	eventId: string;
	type: Type;
	timestamp: number;
	source: "artifacts";
	actor: {
		account: { tag: string; internalId: string };
	} & (Type extends TransportEventType
		? { user?: never }
		: { user?: { id: string; email: string } });
	payload: Payload;
};

/** Namespace creation event. */
export type NamespaceCreatedV1 = Event<
	"namespace.created.v1",
	{ namespace: NamespaceSnapshot }
>;
/** Namespace deletion event. */
export type NamespaceDeletedV1 = Event<
	"namespace.deleted.v1",
	{ namespace: NamespaceSnapshot }
>;
/** Repository creation event. */
export type RepoCreatedV1 = Event<"repo.created.v1", { repo: RepoSnapshot }>;
/** Repository deletion event. */
export type RepoDeletedV1 = Event<"repo.deleted.v1", { repo: RepoSnapshot }>;
/** Repository fork event. */
export type RepoForkedV1 = Event<
	"repo.forked.v1",
	{ repo: RepoSnapshot; forkedFrom: RepoLocality }
>;
/** Repository import event. */
export type RepoImportedV1 = Event<
	"repo.imported.v1",
	{ repo: RepoSnapshot; importedFrom: { url: string; branch: string | null } }
>;
/** One successful Git ref update. */
export type RepoPushedV1 = Event<
	"repo.pushed.v1",
	{ repo: RepoLocality; push: Push }
>;
/** Git storage-size observation. */
export type RepoSizeObservedV1 = Event<
	"repo.size_observed.v1",
	{ repo: RepoLocality; sequence: number; gitServerSizeBytes: number }
>;
/** Repository clone event. */
export type RepoClonedV1 = Event<"repo.cloned.v1", { repo: RepoLocality }>;
/** Repository incremental fetch event. */
export type RepoFetchedV1 = Event<"repo.fetched.v1", { repo: RepoLocality }>;
/** Repository access-token creation event. */
export type TokenCreatedV1 = Event<
	"token.created.v1",
	{
		repo: RepoLocality;
		token: { id: string; scope: string; expiresAt: string };
	}
>;
/** Repository access-token revocation event. */
export type TokenRevokedV1 = Event<
	"token.revoked.v1",
	{ repo: RepoLocality; token: { id: string } }
>;

/** Canonical local events; consumer-facing projections are separate. */
export type ArtifactsEvent =
	| NamespaceCreatedV1
	| NamespaceDeletedV1
	| RepoCreatedV1
	| RepoDeletedV1
	| RepoForkedV1
	| RepoImportedV1
	| RepoPushedV1
	| RepoSizeObservedV1
	| RepoClonedV1
	| RepoFetchedV1
	| TokenCreatedV1
	| TokenRevokedV1;

function make<Type extends string, Payload>(
	type: Type,
	payload: Payload
): Event<Type, Payload> {
	return {
		envelopeVersion: 1,
		eventId: crypto.randomUUID(),
		type,
		timestamp: Date.now(),
		source: "artifacts",
		// Local development has no authenticated account or user.
		actor: { account: { tag: "local", internalId: "local" } },
		payload,
	};
}

/** Constructors for version-one canonical Artifacts events. */
export const V1 = {
	namespaceCreated(payload: NamespaceCreatedV1["payload"]): NamespaceCreatedV1 {
		return make("namespace.created.v1", payload);
	},
	namespaceDeleted(payload: NamespaceDeletedV1["payload"]): NamespaceDeletedV1 {
		return make("namespace.deleted.v1", payload);
	},
	repoCreated(payload: RepoCreatedV1["payload"]): RepoCreatedV1 {
		return make("repo.created.v1", payload);
	},
	repoDeleted(payload: RepoDeletedV1["payload"]): RepoDeletedV1 {
		return make("repo.deleted.v1", payload);
	},
	repoForked(payload: RepoForkedV1["payload"]): RepoForkedV1 {
		return make("repo.forked.v1", payload);
	},
	repoImported(payload: RepoImportedV1["payload"]): RepoImportedV1 {
		return make("repo.imported.v1", payload);
	},
	repoPushed(payload: RepoPushedV1["payload"]): RepoPushedV1 {
		return make("repo.pushed.v1", payload);
	},
	repoSizeObserved(payload: RepoSizeObservedV1["payload"]): RepoSizeObservedV1 {
		return make("repo.size_observed.v1", payload);
	},
	repoCloned(payload: RepoClonedV1["payload"]): RepoClonedV1 {
		return make("repo.cloned.v1", payload);
	},
	repoFetched(payload: RepoFetchedV1["payload"]): RepoFetchedV1 {
		return make("repo.fetched.v1", payload);
	},
	tokenCreated(payload: TokenCreatedV1["payload"]): TokenCreatedV1 {
		return make("token.created.v1", payload);
	},
	tokenRevoked(payload: TokenRevokedV1["payload"]): TokenRevokedV1 {
		return make("token.revoked.v1", payload);
	},
};
