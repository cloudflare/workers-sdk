export type ArtifactsTokenScope = "read" | "write";

export type ArtifactsRepoStatus = "ready" | "importing" | "forking";

export interface ArtifactsNamespace {
	id?: string;
	name: string;
	created_at?: string;
	updated_at?: string;
}

export interface ArtifactsRepo {
	id: string;
	name: string;
	description: string | null;
	default_branch: string;
	created_at: string;
	updated_at: string;
	last_push_at: string | null;
	source: string | null;
	read_only: boolean;
	remote: string;
	status?: ArtifactsRepoStatus;
}

export interface ArtifactsCreateRepoRequest {
	name: string;
	description?: string;
	default_branch?: string;
	read_only?: boolean;
}

export interface ArtifactsCreateRepoResult {
	id: string;
	name: string;
	description: string | null;
	default_branch: string;
	remote: string;
	token: string;
	read_only?: boolean;
}

export interface ArtifactsIssueTokenRequest {
	repo: string;
	scope?: ArtifactsTokenScope;
	ttl?: number;
}

export interface ArtifactsIssueTokenResult {
	id: string;
	plaintext: string;
	scope: ArtifactsTokenScope;
	expires_at: string;
}
