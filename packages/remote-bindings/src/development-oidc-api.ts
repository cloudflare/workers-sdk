import { Buffer } from "node:buffer";
import { TextDecoder } from "node:util";
import { performApiFetchBase } from "@cloudflare/workers-utils";
import { validOidcAudience } from "@cloudflare/workers-utils/oidc";
import { version } from "../package.json";
import { DevelopmentOidcApiError } from "./development-oidc-errors";
import type {
	DevelopmentOidcSession,
	DevelopmentOidcTransport,
} from "./development-oidc";
import type {
	CfAccount,
	ComplianceConfig,
	Logger,
} from "@cloudflare/workers-utils";
import type { Response as ApiResponse } from "undici";

export { DevelopmentOidcApiError } from "./development-oidc-errors";

const PUBLIC_ID = /^[a-f0-9]{32}$/;
const SESSION_ID =
	/^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/;
const INVALID =
	"Cloudflare returned an invalid development OIDC response. Retry the getter.";

function object(value: unknown): Record<string, unknown> {
	if (value === null || typeof value !== "object" || Array.isArray(value)) {
		throw new DevelopmentOidcApiError(INVALID);
	}
	return value as Record<string, unknown>;
}

/** Enforce the API's StringOrURI rules without fetching or normalizing audiences. */
export function validateDevelopmentOidcApiAudience(audience: string): void {
	if (!validOidcAudience(audience)) {
		throw new DevelopmentOidcApiError(
			"Development OIDC requires a non-whitespace StringOrURI audience of 1–2048 UTF-8 bytes. Values containing a colon must be valid URIs."
		);
	}
}

function retryAfterMs(response: ApiResponse): number | undefined {
	const value = response.headers.get("Retry-After")?.trim();
	if (!value) {
		return;
	}
	const delay = /^\d+$/.test(value)
		? Number(value) * 1000
		: Date.parse(value) - Date.now();
	return Number.isSafeInteger(delay) && delay >= 0 ? delay : undefined;
}

async function readResult(response: ApiResponse): Promise<unknown> {
	// Never read or surface API error bodies, which could reflect credentials or bearer tokens.
	if (!response.ok) {
		await response.body?.cancel().catch(() => {});
		if (response.status === 401) {
			throw new DevelopmentOidcApiError(
				"Development OIDC login expired. Sign in again with cf auth login or wrangler login, then retry the getter.",
				"login_required"
			);
		}
		if (response.status === 403) {
			throw new DevelopmentOidcApiError(
				"Development OIDC access denied. Check the selected account, existing Worker, OAuth grant, Worker edit permission, and binding configuration.",
				"access_denied"
			);
		}
		if (response.status === 404) {
			throw new DevelopmentOidcApiError(
				"Development OIDC Worker or session was not found. Check the linked Worker and retry the getter."
			);
		}
		if (response.status === 429) {
			throw new DevelopmentOidcApiError(
				"Development OIDC is rate limited. Retry the getter later.",
				"rate_limited",
				retryAfterMs(response)
			);
		}
		if (response.status === 409) {
			throw new DevelopmentOidcApiError(
				"Development OIDC session needs renewal. Retry the getter to create a new session.",
				"session_renewal"
			);
		}
		throw new DevelopmentOidcApiError(
			"Development OIDC issuance is unavailable. Check connectivity and service availability, then retry the getter.",
			response.status >= 500 && response.status <= 599
				? "unavailable"
				: "invalid",
			retryAfterMs(response)
		);
	}
	if (
		response.headers
			.get("content-type")
			?.split(";")[0]
			?.trim()
			.toLowerCase() !== "application/json"
	) {
		await response.body?.cancel().catch(() => {});
		throw new DevelopmentOidcApiError(INVALID);
	}
	const reader = response.body?.getReader();
	if (!reader) {
		throw new DevelopmentOidcApiError(INVALID);
	}
	// One bounded allocation also limits overhead from many tiny stream chunks.
	const bytes = Buffer.alloc(131072);
	let size = 0;
	try {
		for (;;) {
			const { done, value } = await reader.read();
			if (done) {
				break;
			}
			if (value.byteLength > bytes.length - size) {
				throw new DevelopmentOidcApiError(INVALID);
			}
			bytes.set(value, size);
			size += value.byteLength;
		}
		const envelope = object(
			JSON.parse(
				new TextDecoder("utf-8", { fatal: true }).decode(
					bytes.subarray(0, size)
				)
			)
		);
		if (envelope.success !== true) {
			throw new DevelopmentOidcApiError(INVALID);
		}
		return envelope.result;
	} catch (error) {
		if (error instanceof DevelopmentOidcApiError) {
			throw error;
		}
		throw new DevelopmentOidcApiError(INVALID);
	} finally {
		await reader.cancel().catch(() => {});
		reader.releaseLock();
	}
}

function decode(segment: string): Record<string, unknown> {
	const bytes = Buffer.from(segment, "base64url");
	if (bytes.toString("base64url") !== segment) {
		throw new DevelopmentOidcApiError(INVALID);
	}
	try {
		return object(
			JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes))
		);
	} catch {
		throw new DevelopmentOidcApiError(INVALID);
	}
}

/** Validate the development profile received over the authenticated Cloudflare API connection. */
export function validateDevelopmentOidcApiToken(
	value: unknown,
	session: DevelopmentOidcSession,
	audience: string,
	grant?: { scope?: string[] }
): { token: string; expiresAt: number } {
	const result = object(value);
	const token = result.token;
	if (
		typeof token !== "string" ||
		token.length > 65536 ||
		!/^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/.test(token)
	) {
		throw new DevelopmentOidcApiError(INVALID);
	}
	const [headerPart, claimsPart, signature] = token.split(".");
	if (
		!headerPart ||
		!claimsPart ||
		!signature ||
		Buffer.from(signature, "base64url").toString("base64url") !== signature
	) {
		throw new DevelopmentOidcApiError(INVALID);
	}
	const header = decode(headerPart),
		claims = decode(claimsPart);
	const { accountId, workerId, userId, developmentSessionId } =
		session.identity;
	const now = Date.now() / 1000;
	const issued = claims.iat,
		expires = claims.exp;
	if (
		header.alg !== "RS256" ||
		header.typ !== (grant ? "JWT" : "cf-workload+jwt") ||
		typeof header.kid !== "string" ||
		!header.kid ||
		header.kid.length > 128 ||
		"crit" in header ||
		"b64" in header ||
		claims.iss !== `https://oidc.cloudflare.app/accounts/${accountId}` ||
		claims.sub !== `worker:${workerId}:development:local` ||
		claims.account_id !== accountId ||
		claims.product !== "workers" ||
		typeof claims.jti !== "string" ||
		!/^[A-Za-z0-9_-]{22,128}$/.test(claims.jti) ||
		claims.aud !== audience ||
		claims.scope !==
			(grant?.scope === undefined
				? undefined
				: [...new Set(grant.scope)].sort().join(" ")) ||
		claims.execution !== "local" ||
		claims.worker_id !== workerId ||
		claims.user_id !== userId ||
		claims.development_session_id !== developmentSessionId ||
		["version_id", "preview_id", "namespace_id", "object_id"].some(
			(key) => key in claims
		) ||
		typeof issued !== "number" ||
		!Number.isSafeInteger(issued) ||
		typeof expires !== "number" ||
		!Number.isSafeInteger(expires) ||
		expires !== result.expires_at ||
		expires - issued !== 300 ||
		issued > now + 5 ||
		issued <= 0 ||
		expires < now + 60 ||
		expires > now + 300 ||
		expires > session.expiresAt
	) {
		throw new DevelopmentOidcApiError(INVALID);
	}
	return { token, expiresAt: expires };
}

/** Cloudflare v4 development issuance transport; credentials never enter Worker code. */
export function createDevelopmentOidcApiTransport(
	compliance: ComplianceConfig,
	logger: Logger
): DevelopmentOidcTransport {
	async function request(
		auth: CfAccount,
		resource: string,
		body: object,
		signal: AbortSignal,
		raw = false
	): Promise<unknown> {
		if (
			auth.accountId.length !== 32 ||
			!PUBLIC_ID.test(auth.accountId) ||
			!("apiToken" in auth.apiToken)
		) {
			throw new DevelopmentOidcApiError(
				"Development OIDC requires human OAuth and a valid account."
			);
		}
		let response: ApiResponse;
		try {
			response = await performApiFetchBase(
				compliance,
				resource,
				{
					method: "POST",
					body: JSON.stringify(body),
					headers: {
						"Content-Type": "application/json",
						Accept: "application/json",
					},
					redirect: "error",
				},
				`remote-bindings/${version}`,
				logger,
				undefined,
				signal,
				auth.apiToken
			);
		} catch {
			signal.throwIfAborted();
			throw new DevelopmentOidcApiError(
				"Development OIDC could not reach Cloudflare. Check connectivity and retry the getter.",
				"unavailable"
			);
		}
		if (raw && response.headers.get("X-Workers-OIDC-Result") === "fetch") {
			const headers = new Headers([...response.headers]);
			headers.delete("X-Workers-OIDC-Result");
			return new globalThis.Response(
				response.body as ReadableStream<Uint8Array>,
				{ status: response.status, statusText: response.statusText, headers }
			);
		}
		const result = await readResult(response);
		if (raw) {
			throw new DevelopmentOidcApiError(
				"Cloudflare did not return a signed dispatch response."
			);
		}
		return result;
	}
	return {
		async createSession(auth, workerName, binding, signal) {
			if (
				workerName.trim() !== workerName ||
				!/^[A-Za-z0-9_-]{1,63}$/.test(workerName)
			) {
				throw new DevelopmentOidcApiError(
					"Development OIDC requires a valid existing Worker name."
				);
			}
			const data = object(
				await request(
					auth,
					`/accounts/${encodeURIComponent(auth.accountId)}/workers/scripts/${encodeURIComponent(workerName)}/oidc/development-sessions`,
					binding,
					signal
				)
			);
			const now = Date.now() / 1000;
			if (
				data.account_id !== auth.accountId ||
				typeof data.worker_id !== "string" ||
				data.worker_id.length !== 32 ||
				!PUBLIC_ID.test(data.worker_id) ||
				typeof data.user_id !== "string" ||
				data.user_id.length !== 32 ||
				!PUBLIC_ID.test(data.user_id) ||
				typeof data.development_session_id !== "string" ||
				data.development_session_id.length !== 36 ||
				!SESSION_ID.test(data.development_session_id) ||
				data.binding !== binding.binding ||
				data.default_audience !== binding.audience ||
				typeof data.expires_at !== "number" ||
				!Number.isSafeInteger(data.expires_at) ||
				data.expires_at < now + 300 ||
				data.expires_at > now + 28800
			) {
				throw new DevelopmentOidcApiError(INVALID);
			}
			validateDevelopmentOidcApiAudience(data.default_audience);
			logger.info(
				`Development OIDC subject for ${workerName}: worker:${data.worker_id}:development:local`
			);
			return {
				identity: {
					accountId: auth.accountId,
					workerId: data.worker_id,
					userId: data.user_id,
					developmentSessionId: data.development_session_id,
				},
				defaultAudience: data.default_audience,
				binding: data.binding,
				expiresAt: data.expires_at,
			};
		},
		async issueToken(auth, session, signal) {
			return validateDevelopmentOidcApiToken(
				await request(
					auth,
					sessionPath(auth, session),
					{ operation: "token" },
					signal
				),
				session,
				session.defaultAudience
			);
		},
		async issueGrant(auth, session, options, signal) {
			return validateDevelopmentOidcApiToken(
				await request(
					auth,
					sessionPath(auth, session),
					{ operation: "grant", grant: options },
					signal
				),
				session,
				options.authorization_server,
				options
			);
		},
		async dispatch(auth, session, options, signal) {
			return (await request(
				auth,
				sessionPath(auth, session),
				{ operation: "fetch", request: options },
				signal,
				true
			)) as globalThis.Response;
		},
	};
}
function sessionPath(auth: CfAccount, session: DevelopmentOidcSession): string {
	if (
		auth.accountId !== session.identity.accountId ||
		!SESSION_ID.test(session.identity.developmentSessionId)
	) {
		throw new DevelopmentOidcApiError(INVALID);
	}
	return `/accounts/${encodeURIComponent(auth.accountId)}/workers/oidc/development-sessions/${session.identity.developmentSessionId}/tokens`;
}
