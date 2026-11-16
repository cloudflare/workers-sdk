import { HTTPException } from "hono/http-exception";
import { validator } from "hono/validator";
import type {
	ExplorerNamespaceSummary,
	LocalArtifactsExplorer,
	Outcome,
} from "../../artifacts/binding.worker";
import type { AppContext } from "../common";
import type {
	ArtifactsRepoTokensListData,
	ArtifactsReposCreateData,
	ArtifactsReposForkData,
	ArtifactsReposImportData,
	ArtifactsReposListData,
	ArtifactsTokensCreateData,
} from "../generated";
import type { z } from "miniflare:zod";

// Public Artifacts REST API error codes.
const INVALID_INPUT = 10100;
const INVALID_REPO_NAME = 10101;
const INVALID_TTL = 10103;
const INVALID_URL = 10104;
const NOT_FOUND = 10200;
const UPSTREAM_UNAVAILABLE = 10401;

type ArtifactsExplorerService = Pick<
	LocalArtifactsExplorer,
	| "summary"
	| "list"
	| "info"
	| "create"
	| "import"
	| "delete"
	| "fork"
	| "listTokens"
	| "createToken"
	| "revokeToken"
>;

type Failure = Extract<Outcome<unknown>, { ok: false }>["error"];

// The simulator's failure codes, mapped to the statuses production returns.
const STATUS_BY_CODE: Record<Failure["code"], number> = {
	INVALID_INPUT: 400,
	INVALID_REPO_NAME: 400,
	INVALID_TTL: 400,
	INVALID_URL: 400,
	REMOTE_AUTH_REQUIRED: 422,
	NOT_FOUND: 404,
	ALREADY_EXISTS: 409,
	MEMORY_LIMIT: 413,
	UPSTREAM_UNAVAILABLE: 503,
	INTERNAL_ERROR: 500,
};

/** A Cloudflare API error envelope, shaped like the deployed Artifacts API. */
function artifactsError(
	status: number,
	code: number,
	message: string,
	pointer?: string
): Response {
	return Response.json(
		{
			result: null,
			success: false,
			errors: [
				{
					code,
					message,
					documentation_url: `https://developers.cloudflare.com/artifacts/api/errors#${code}`,
					...(pointer === undefined ? {} : { source: { pointer } }),
				},
			],
			messages: [],
		},
		{ status }
	);
}

function artifactsOk(
	c: AppContext,
	result: unknown,
	options: { status?: 200 | 201 | 202; resultInfo?: unknown } = {}
): Response {
	return c.json(
		{
			result,
			success: true,
			errors: [],
			messages: [],
			...(options.resultInfo === undefined
				? {}
				: { result_info: options.resultInfo }),
		},
		options.status ?? 200
	);
}

function failureResponse(error: Failure): Response {
	return artifactsError(
		STATUS_BY_CODE[error.code] ?? 500,
		error.numericCode,
		error.message
	);
}

type BodyIssue = z.core.$ZodIssue;

/**
 * Validates a JSON body with a generated schema, reporting the first failure
 * with the error code and JSON pointer the deployed API uses for that field.
 */
export function validateArtifactsBody<T extends z.ZodType>(
	schema: T,
	describe: (issue: BodyIssue) => { code: number; message: string }
) {
	const middleware = validator("json", async (value, _c) => {
		const result = await schema.safeParseAsync(value);
		if (!result.success) {
			const issue = result.error.issues[0];
			const { code, message } = describe(issue);
			const pointer =
				issue.path.length > 0 ? `/${issue.path.join("/")}` : undefined;
			return artifactsError(400, code, message, pointer);
		}
		return result.data as z.output<T>;
	});
	const handleMalformedJson: typeof middleware = async (c, next) => {
		try {
			return await middleware(c, next);
		} catch (error) {
			if (error instanceof HTTPException && error.status === 400) {
				return artifactsError(400, INVALID_INPUT, "Invalid JSON request body");
			}
			throw error;
		}
	};
	return handleMalformedJson;
}

const INVALID_NAME_MESSAGE =
	"Invalid repo name: must match /^[a-zA-Z0-9][a-zA-Z0-9._-]*$/";

/** Field-specific errors for repository create and fork bodies. */
export function describeRepoBodyIssue(issue: BodyIssue): {
	code: number;
	message: string;
} {
	switch (issue.path[0]) {
		case "default_branch":
			return {
				code: INVALID_INPUT,
				message: `Invalid default_branch: ${issue.message}`,
			};
		case "description":
			return {
				code: INVALID_INPUT,
				message: "Invalid description: must be 1024 characters or fewer",
			};
		case "name":
		case undefined:
			return { code: INVALID_REPO_NAME, message: INVALID_NAME_MESSAGE };
		default:
			return { code: INVALID_INPUT, message: issue.message };
	}
}

export function describeImportBodyIssue(issue: BodyIssue): {
	code: number;
	message: string;
} {
	if (issue.path[0] === "url") {
		return {
			code: INVALID_URL,
			message:
				"url must be an HTTPS git remote URL (e.g. https://github.com/owner/repo)",
		};
	}
	return { code: INVALID_INPUT, message: issue.message };
}

export function describeTokenBodyIssue(issue: BodyIssue): {
	code: number;
	message: string;
} {
	if (issue.path[0] === "ttl") {
		return {
			code: INVALID_TTL,
			message: "ttl must be between 60 and 31536000 seconds",
		};
	}
	if (issue.path[0] === "scope") {
		return { code: INVALID_INPUT, message: "scope must be read or write" };
	}
	return { code: INVALID_INPUT, message: "repo required" };
}

/**
 * Resolves a namespace's explorer service. Locally, a namespace exists when a
 * Worker binds it or it has persisted state; `cf --local` also has `default`.
 */
function getNamespace(
	c: AppContext,
	namespace: string
): ArtifactsExplorerService | Response {
	const { artifacts } = c.env.LOCAL_EXPLORER_BINDING_MAP;
	const info = Object.hasOwn(artifacts.namespaces, namespace)
		? artifacts.namespaces[namespace]
		: undefined;
	if (info !== undefined) {
		return c.env[info.binding] as ArtifactsExplorerService;
	}
	if (artifacts.unavailableReason !== undefined) {
		return artifactsError(
			503,
			UPSTREAM_UNAVAILABLE,
			`Local Artifacts is unavailable: ${artifacts.unavailableReason}`
		);
	}
	return artifactsError(404, NOT_FOUND, "Namespace not found");
}

/** Runs a namespace operation, converting simulator failures to API errors. */
async function withNamespace<T>(
	c: AppContext,
	namespace: string,
	call: (service: ArtifactsExplorerService) => Promise<Outcome<T>>,
	respond: (value: T) => Response
): Promise<Response> {
	const service = getNamespace(c, namespace);
	if (service instanceof Response) {
		return service;
	}
	const outcome = await call(service);
	return outcome.ok ? respond(outcome.value) : failureResponse(outcome.error);
}

function toApiNamespace(summary: ExplorerNamespaceSummary) {
	return {
		namespace: summary.namespace,
		// Local storage has no placement jurisdiction; this is the public default.
		jurisdiction: "unrestricted",
		repo_count: summary.repoCount,
		created_at: summary.createdAt,
		updated_at: summary.updatedAt,
	};
}

type RepoMetadata = Extract<
	Awaited<ReturnType<LocalArtifactsExplorer["info"]>>,
	{ ok: true }
>["value"];

function toApiRepo(repo: RepoMetadata) {
	return {
		id: repo.id,
		name: repo.name,
		description: repo.description,
		default_branch: repo.defaultBranch,
		created_at: repo.createdAt,
		updated_at: repo.updatedAt,
		last_push_at: repo.lastPushAt,
		source: repo.source,
		read_only: repo.readOnly,
		remote: repo.remote,
	};
}

type CreatedRepo = Extract<
	Awaited<ReturnType<LocalArtifactsExplorer["create"]>>,
	{ ok: true }
>["value"];

function toApiCreateResult(repo: CreatedRepo) {
	return {
		id: repo.id,
		name: repo.name,
		description: repo.description,
		default_branch: repo.defaultBranch,
		remote: repo.remote,
		token: repo.token,
	};
}

function offsetResultInfo(
	page: number,
	perPage: number,
	count: number,
	total: number
) {
	return {
		page,
		per_page: perPage,
		total_pages: total > 0 ? Math.ceil(total / perPage) : 0,
		count,
		total_count: total,
	};
}

/** Lists every local namespace; local listings are not paginated. */
export async function listArtifactsNamespaces(
	c: AppContext
): Promise<Response> {
	const { artifacts } = c.env.LOCAL_EXPLORER_BINDING_MAP;
	const outcomes = await Promise.all(
		Object.values(artifacts.namespaces).map((info) =>
			(c.env[info.binding] as ArtifactsExplorerService).summary()
		)
	);
	const namespaces = [];
	for (const outcome of outcomes) {
		if (!outcome.ok) {
			return failureResponse(outcome.error);
		}
		namespaces.push(toApiNamespace(outcome.value));
	}
	namespaces.sort((left, right) =>
		left.namespace.localeCompare(right.namespace)
	);
	return artifactsOk(c, namespaces, {
		resultInfo: offsetResultInfo(
			1,
			Math.max(namespaces.length, 1),
			namespaces.length,
			namespaces.length
		),
	});
}

export function getArtifactsNamespace(
	c: AppContext,
	namespace: string
): Promise<Response> {
	return withNamespace(
		c,
		namespace,
		(service) => service.summary(),
		(summary) => artifactsOk(c, toApiNamespace(summary))
	);
}

export function listArtifactsRepos(
	c: AppContext,
	namespace: string,
	query: NonNullable<ArtifactsReposListData["query"]>
): Promise<Response> {
	const limit = query.limit ?? 50;
	return withNamespace(
		c,
		namespace,
		(service) =>
			service.list({
				limit,
				...(query.cursor === undefined ? {} : { cursor: query.cursor }),
				...(query.search === undefined ? {} : { search: query.search }),
				...(query.sort === undefined ? {} : { sort: query.sort }),
				...(query.direction === undefined
					? {}
					: { direction: query.direction }),
			}),
		(list) =>
			artifactsOk(
				c,
				list.repos.map((repo) => ({ ...toApiRepo(repo), status: repo.status })),
				{
					resultInfo:
						list.cursor === undefined
							? offsetResultInfo(1, limit, list.repos.length, list.total)
							: {
									cursor: list.cursor,
									per_page: limit,
									count: list.repos.length,
								},
				}
			)
	);
}

export function createArtifactsRepo(
	c: AppContext,
	namespace: string,
	body: ArtifactsReposCreateData["body"]
): Promise<Response> {
	return withNamespace(
		c,
		namespace,
		(service) =>
			service.create(body.name, {
				...(body.description === undefined
					? {}
					: { description: body.description }),
				...(body.read_only === undefined ? {} : { readOnly: body.read_only }),
				...(body.default_branch === undefined
					? {}
					: { setDefaultBranch: body.default_branch }),
			}),
		(repo) => artifactsOk(c, toApiCreateResult(repo), { status: 201 })
	);
}

export function getArtifactsRepo(
	c: AppContext,
	namespace: string,
	name: string
): Promise<Response> {
	return withNamespace(
		c,
		namespace,
		(service) => service.info(name),
		(repo) => artifactsOk(c, toApiRepo(repo))
	);
}

export function deleteArtifactsRepo(
	c: AppContext,
	namespace: string,
	name: string
): Promise<Response> {
	return withNamespace(
		c,
		namespace,
		(service) => service.delete(name),
		(id) =>
			id === null
				? artifactsError(404, NOT_FOUND, "Repository not found")
				: artifactsOk(c, { id }, { status: 202 })
	);
}

export function forkArtifactsRepo(
	c: AppContext,
	namespace: string,
	sourceName: string,
	body: ArtifactsReposForkData["body"]
): Promise<Response> {
	return withNamespace(
		c,
		namespace,
		(service) =>
			service.fork(sourceName, body.name, {
				...(body.description === undefined
					? {}
					: { description: body.description }),
				...(body.read_only === undefined ? {} : { readOnly: body.read_only }),
				...(body.default_branch_only === undefined
					? {}
					: { defaultBranchOnly: body.default_branch_only }),
			}),
		(repo) =>
			artifactsOk(
				c,
				{ ...toApiCreateResult(repo), objects: repo.objects },
				{ status: 201 }
			)
	);
}

export function importArtifactsRepo(
	c: AppContext,
	namespace: string,
	name: string,
	body: ArtifactsReposImportData["body"]
): Promise<Response> {
	return withNamespace(
		c,
		namespace,
		(service) =>
			service.import({
				source: {
					url: body.url,
					...(body.branch === undefined ? {} : { branch: body.branch }),
					...(body.depth === undefined ? {} : { depth: body.depth }),
				},
				target: {
					name,
					...(body.read_only === undefined
						? {}
						: { opts: { readOnly: body.read_only } }),
				},
			}),
		(repo) => artifactsOk(c, toApiCreateResult(repo), { status: 201 })
	);
}

export function listArtifactsRepoTokens(
	c: AppContext,
	namespace: string,
	name: string,
	query: NonNullable<ArtifactsRepoTokensListData["query"]>
): Promise<Response> {
	const state = query.state ?? "active";
	const page = query.page ?? 1;
	const perPage = query.per_page ?? 30;
	return withNamespace(
		c,
		namespace,
		(service) => service.listTokens(name),
		(tokens) => {
			const matching = tokens.filter(
				(token) => state === "all" || token.state === state
			);
			const results = matching
				.slice((page - 1) * perPage, page * perPage)
				.map((token) => ({
					id: token.id,
					scope: token.scope,
					state: token.state,
					created_at: token.createdAt,
					expires_at: token.expiresAt,
				}));
			return artifactsOk(c, results, {
				resultInfo: offsetResultInfo(
					page,
					perPage,
					results.length,
					matching.length
				),
			});
		}
	);
}

export function createArtifactsToken(
	c: AppContext,
	namespace: string,
	body: ArtifactsTokensCreateData["body"]
): Promise<Response> {
	return withNamespace(
		c,
		namespace,
		(service) => service.createToken(body.repo, body.scope, body.ttl),
		(token) =>
			artifactsOk(
				c,
				{
					id: token.id,
					plaintext: token.plaintext,
					scope: token.scope,
					expires_at: token.expiresAt,
				},
				{ status: 201 }
			)
	);
}

export function revokeArtifactsToken(
	c: AppContext,
	namespace: string,
	id: string
): Promise<Response> {
	return withNamespace(
		c,
		namespace,
		(service) => service.revokeToken(id),
		(revoked) =>
			revoked
				? artifactsOk(c, { id })
				: artifactsError(404, NOT_FOUND, "Token not found")
	);
}
