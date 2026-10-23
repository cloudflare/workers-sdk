import { Buffer } from "node:buffer";
import { TextDecoder } from "node:util";
import { performApiFetchBase } from "@cloudflare/workers-utils";
import { validateDevelopmentOidcAudience } from "miniflare";
import { version } from "../package.json";
import type {
	DevelopmentOidcSession,
	DevelopmentOidcTransport,
} from "./development-oidc";
import type {
	CfAccount,
	ComplianceConfig,
	Logger,
} from "@cloudflare/workers-utils";
import type { Response } from "undici";

/** Sanitized issuance errors that are safe to show in the host dev server. */
export class DevelopmentOidcApiError extends Error {}

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
	validateDevelopmentOidcAudience(audience);
	if (audience.includes(":")) {
		// StringOrURI requires a URI scheme when a colon occurs. Preserve the original string.
		if (
			!/^[A-Za-z][A-Za-z0-9+.-]*:/.test(audience) ||
			/[^\x21-\x7e]/.test(audience) ||
			/%(?![A-Fa-f0-9]{2})/.test(audience)
		) {
			throw new DevelopmentOidcApiError(
				"Development OIDC audiences containing a colon must be valid URIs."
			);
		}
		try {
			new URL(audience);
		} catch {
			throw new DevelopmentOidcApiError(
				"Development OIDC audiences containing a colon must be valid URIs."
			);
		}
	}
}

async function readResult(response: Response): Promise<unknown> {
	// Never read or surface API error bodies, which could reflect credentials or bearer tokens.
	if (!response.ok) {
		await response.body?.cancel().catch(() => {});
		if (response.status === 401) {
			throw new DevelopmentOidcApiError(
				"Development OIDC login expired. Sign in again with cf auth login or wrangler login, then retry the getter."
			);
		}
		if (response.status === 403) {
			throw new DevelopmentOidcApiError(
				"Development OIDC access denied. Check the selected account, existing Worker, OAuth grant, and Worker edit permission."
			);
		}
		if (response.status === 404) {
			throw new DevelopmentOidcApiError(
				"Development OIDC Worker or session was not found. Check the linked Worker and retry the getter."
			);
		}
		if (response.status === 429) {
			throw new DevelopmentOidcApiError(
				"Development OIDC is rate limited. Retry the getter later."
			);
		}
		throw new DevelopmentOidcApiError(
			"Development OIDC issuance is unavailable. Check connectivity and service availability, then retry the getter."
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
	audience: string
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
		header.typ !== "cf-workload+jwt" ||
		typeof header.kid !== "string" ||
		!header.kid ||
		header.kid.length > 128 ||
		"crit" in header ||
		"b64" in header ||
		claims.iss !== `https://oidc.cloudflare.app/accounts/${accountId}` ||
		claims.sub !== `worker:${workerId}:development:user:${userId}` ||
		claims.aud !== audience ||
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
		signal: AbortSignal
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
		let response: Response;
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
			throw new DevelopmentOidcApiError(
				"Development OIDC could not reach Cloudflare. Check connectivity and retry the getter."
			);
		}
		return readResult(response);
	}
	return {
		async createSession(auth, workerName, signal) {
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
					{},
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
				data.policy !== "workers-oidc-v1" ||
				data.default_audience !==
					`https://workers.cloudflare.com/accounts/${auth.accountId}` ||
				typeof data.expires_at !== "number" ||
				!Number.isSafeInteger(data.expires_at) ||
				data.expires_at < now + 300 ||
				data.expires_at > now + 28800
			) {
				throw new DevelopmentOidcApiError(INVALID);
			}
			logger.info(
				`Development OIDC subject for ${workerName}: worker:${data.worker_id}:development:user:${data.user_id} (local execution)`
			);
			return {
				identity: {
					accountId: auth.accountId,
					workerId: data.worker_id,
					userId: data.user_id,
					developmentSessionId: data.development_session_id,
					policy: data.policy,
				},
				defaultAudience: data.default_audience,
				expiresAt: data.expires_at,
			};
		},
		async issueToken(auth, session, audience, signal) {
			validateDevelopmentOidcApiAudience(audience);
			if (
				auth.accountId !== session.identity.accountId ||
				session.identity.developmentSessionId.length !== 36 ||
				!SESSION_ID.test(session.identity.developmentSessionId)
			) {
				throw new DevelopmentOidcApiError(INVALID);
			}
			return validateDevelopmentOidcApiToken(
				await request(
					auth,
					`/accounts/${encodeURIComponent(auth.accountId)}/workers/oidc/development-sessions/${session.identity.developmentSessionId}/tokens`,
					{ audience },
					signal
				),
				session,
				audience
			);
		},
	};
}
