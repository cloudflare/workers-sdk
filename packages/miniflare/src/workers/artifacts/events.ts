/*
 * Canonical Artifacts events. The versioned payload shapes and event names
 * follow the Artifacts event contract; Workflow/Queue projections are separate.
 */
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

type RepoLocality = { namespace: string; name: string };
type TokenDetails = { id: string; scope: string; expiresAt: string };

type Payloads = {
	"namespace.created.v1": {
		namespace: {
			name: string;
			jurisdiction: "unrestricted";
			createdAt: string;
			updatedAt: string;
		};
	};
	"namespace.deleted.v1": Payloads["namespace.created.v1"];
	"repo.created.v1": { repo: RepoSnapshot };
	"repo.deleted.v1": { repo: RepoSnapshot };
	"repo.forked.v1": { repo: RepoSnapshot; forkedFrom: RepoLocality };
	"repo.imported.v1": {
		repo: RepoSnapshot;
		importedFrom: { url: string; branch: string | null };
	};
	"repo.pushed.v1": {
		repo: RepoLocality;
		push: {
			ref: string;
			before: string;
			after: string;
			commits: {
				id: string;
				message: string;
				messageTruncated: boolean;
				timestamp: string;
				author: { name: string; email: string };
				committer: { name: string; email: string };
				parents: string[];
			}[];
			totalCommitsCount: number;
			commitsTruncated: boolean;
		};
	};
	"repo.size_observed.v1": {
		repo: RepoLocality;
		sequence: number;
		gitServerSizeBytes: number;
	};
	"repo.cloned.v1": { repo: RepoLocality };
	"repo.fetched.v1": { repo: RepoLocality };
	"token.created.v1": { repo: RepoLocality; token: TokenDetails };
	"token.revoked.v1": { repo: RepoLocality; token: { id: string } };
};

type TransportEventType =
	| "repo.pushed.v1"
	| "repo.cloned.v1"
	| "repo.fetched.v1"
	| "repo.size_observed.v1";

type Event<Type extends keyof Payloads> = {
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
	payload: Payloads[Type];
};

/** Local equivalent of the production canonical event, not a Workflow event. */
export type ArtifactsEvent = {
	[Type in keyof Payloads]: Event<Type>;
}[keyof Payloads];

function make<Type extends keyof Payloads>(
	type: Type,
	payload: Payloads[Type]
): Event<Type> {
	return {
		envelopeVersion: 1,
		eventId: crypto.randomUUID(),
		type,
		timestamp: Date.now(),
		source: "artifacts",
		// A local simulator has no authenticated account or user identity.
		actor: { account: { tag: "local", internalId: "local" } },
		payload,
	};
}

/** Strongly typed constructors for every version-one canonical Artifacts event. */
export const V1 = {
	/** Construct a namespace creation event. */
	namespaceCreated(
		payload: Payloads["namespace.created.v1"]
	): Event<"namespace.created.v1"> {
		return make("namespace.created.v1", payload);
	},
	/** Construct a namespace deletion event. */
	namespaceDeleted(
		payload: Payloads["namespace.deleted.v1"]
	): Event<"namespace.deleted.v1"> {
		return make("namespace.deleted.v1", payload);
	},
	/** Construct a repository creation event. */
	repoCreated(payload: Payloads["repo.created.v1"]): Event<"repo.created.v1"> {
		return make("repo.created.v1", payload);
	},
	/** Construct a repository deletion event. */
	repoDeleted(payload: Payloads["repo.deleted.v1"]): Event<"repo.deleted.v1"> {
		return make("repo.deleted.v1", payload);
	},
	/** Construct a repository fork event. */
	repoForked(payload: Payloads["repo.forked.v1"]): Event<"repo.forked.v1"> {
		return make("repo.forked.v1", payload);
	},
	/** Construct a repository import event. */
	repoImported(
		payload: Payloads["repo.imported.v1"]
	): Event<"repo.imported.v1"> {
		return make("repo.imported.v1", payload);
	},
	/** Construct a successful ref-update event. */
	repoPushed(payload: Payloads["repo.pushed.v1"]): Event<"repo.pushed.v1"> {
		return make("repo.pushed.v1", payload);
	},
	/** Construct a Git storage-size observation event. */
	repoSizeObserved(
		payload: Payloads["repo.size_observed.v1"]
	): Event<"repo.size_observed.v1"> {
		return make("repo.size_observed.v1", payload);
	},
	/** Construct a clone event. */
	repoCloned(payload: Payloads["repo.cloned.v1"]): Event<"repo.cloned.v1"> {
		return make("repo.cloned.v1", payload);
	},
	/** Construct an incremental fetch event. */
	repoFetched(payload: Payloads["repo.fetched.v1"]): Event<"repo.fetched.v1"> {
		return make("repo.fetched.v1", payload);
	},
	/** Construct a repository access-token creation event. */
	tokenCreated(
		payload: Payloads["token.created.v1"]
	): Event<"token.created.v1"> {
		return make("token.created.v1", payload);
	},
	/** Construct a repository access-token revocation event. */
	tokenRevoked(
		payload: Payloads["token.revoked.v1"]
	): Event<"token.revoked.v1"> {
		return make("token.revoked.v1", payload);
	},
};
