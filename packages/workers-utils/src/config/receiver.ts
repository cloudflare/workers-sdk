/** Receiver expectations arrive through protected configuration, never a request. */
export interface IdentityReceiverConfiguration {
	delegated_requests: {
		profile: "poppy-0.3";
		company_id?: string;
		account_authorization?: {
			issuer: string;
			audience: string;
			access_tokens?: {
				profile?: "rfc9068";
				jwks_uri?: string;
				algorithms?: ("RS256" | "ES256")[];
			};
		};
	};
}

function record(
	value: unknown,
	required: string[],
	optional: string[] = []
): Record<string, unknown> {
	if (
		!value ||
		typeof value !== "object" ||
		Array.isArray(value) ||
		required.some((key) => !Object.hasOwn(value, key)) ||
		Object.keys(value).some(
			(key) => !required.includes(key) && !optional.includes(key)
		)
	) {
		throw new TypeError("Invalid identity receiver configuration.");
	}
	return value as Record<string, unknown>;
}

function hasUnsafeURICharacters(value: string): boolean {
	if (/[\s\\]/u.test(value)) {
		return true;
	}
	for (const character of value) {
		const code = character.charCodeAt(0);
		if (code < 32 || code === 127) {
			return true;
		}
	}
	return false;
}

/** Validate URLs before lookup; the public-only outbound network enforces resolved addresses. */
export function publicIdentityURL(value: unknown): string {
	if (
		typeof value !== "string" ||
		value.length > 2048 ||
		hasUnsafeURICharacters(value)
	) {
		throw new TypeError("Invalid public identity URL.");
	}
	const url = new URL(value);
	if (
		url.protocol !== "https:" ||
		url.username ||
		url.password ||
		url.search ||
		url.hash ||
		url.port ||
		!/^(?:[a-z0-9](?:[a-z0-9-]*[a-z0-9])?\.)+[a-z][a-z0-9-]*$/i.test(
			url.hostname
		) ||
		/(?:^|\.)(?:localhost|local|internal|invalid)$/i.test(url.hostname) ||
		url.hostname.endsWith(".")
	) {
		throw new TypeError("Identity discovery requires a public HTTPS hostname.");
	}
	return value;
}

/** Return a detached, strict configuration so later mutations cannot change trust. */
export function parseIdentityReceiver(
	value: unknown
): IdentityReceiverConfiguration {
	if (new TextEncoder().encode(JSON.stringify(value)).length > 8192) {
		throw new TypeError(
			"Identity receiver configuration exceeds its size limit."
		);
	}
	const root = record(value, ["delegated_requests"]);
	const delegated = record(
		root["delegated_requests"],
		["profile"],
		["company_id", "account_authorization"]
	);
	if (delegated["profile"] !== "poppy-0.3") {
		throw new TypeError("Unsupported delegated identity profile.");
	}
	const company_id = Object.hasOwn(delegated, "company_id")
		? publicIdentityURL(delegated["company_id"])
		: undefined;
	const result: IdentityReceiverConfiguration = {
		delegated_requests: {
			profile: "poppy-0.3",
			...(company_id === undefined ? {} : { company_id }),
		},
	};
	if (Object.hasOwn(delegated, "account_authorization")) {
		const account = record(
			delegated["account_authorization"],
			["issuer", "audience"],
			["access_tokens"]
		);
		const issuer = publicIdentityURL(account["issuer"]);
		const audience = account["audience"];
		if (
			(company_id !== undefined && issuer !== company_id) ||
			typeof audience !== "string" ||
			audience.length > 2048 ||
			hasUnsafeURICharacters(audience) ||
			new URL(audience).hash
		) {
			throw new TypeError("Invalid account issuer or resource audience.");
		}
		const authorization: NonNullable<
			IdentityReceiverConfiguration["delegated_requests"]["account_authorization"]
		> = { issuer, audience };
		if (Object.hasOwn(account, "access_tokens")) {
			const tokens = record(
				account["access_tokens"],
				[],
				["profile", "jwks_uri", "algorithms"]
			);
			if (Object.hasOwn(tokens, "profile") && tokens["profile"] !== "rfc9068") {
				throw new TypeError("Unsupported account access-token profile.");
			}
			const algorithms = tokens["algorithms"];
			if (
				Object.hasOwn(tokens, "algorithms") &&
				(!Array.isArray(algorithms) ||
					!algorithms.length ||
					algorithms.length > 2 ||
					new Set(algorithms).size !== algorithms.length ||
					algorithms.some((alg) => alg !== "RS256" && alg !== "ES256"))
			) {
				throw new TypeError("Unsupported account access-token algorithms.");
			}
			authorization.access_tokens = {
				...(Object.hasOwn(tokens, "profile")
					? { profile: "rfc9068" as const }
					: {}),
				...(Object.hasOwn(tokens, "jwks_uri")
					? { jwks_uri: publicIdentityURL(tokens["jwks_uri"]) }
					: {}),
				...(Array.isArray(algorithms)
					? { algorithms: [...algorithms] as ("RS256" | "ES256")[] }
					: {}),
			};
		}
		result.delegated_requests.account_authorization = authorization;
	} else if (company_id === undefined) {
		throw new TypeError("Set company_id when account authorization is absent.");
	}
	return result;
}

export type DelegatedRequestIdentity = Readonly<{
	kind: "delegated-request";
	clientId: string;
	userId: string;
	sessionId: string;
	agentId?: string;
	account?: Readonly<{
		issuer: string;
		subject: string;
		audience: string;
		scopes: readonly string[];
		expiresAt: number;
	}>;
}>;

export type IdentityFailureResponse = Readonly<{
	status: 400 | 401;
	headers: Readonly<Record<string, string>>;
	body: Readonly<{ error: "invalid_session" }> | null;
}>;
