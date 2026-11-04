/** Caller expectations arrive through protected configuration, never a request. */
export interface CallerIdentityConfiguration {
	profile: "poppy-0.3";
	companyId?: string;
	accountTokens?: {
		issuer: string;
		audience: string;
		profile?: "rfc9068";
		jwksUri?: string;
		algorithms?: ("RS256" | "ES256")[];
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
		throw new TypeError("Invalid callerIdentity configuration.");
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

/** Return detached, strict expectations so later mutations cannot change trust. */
export function parseCallerIdentity(
	value: unknown
): CallerIdentityConfiguration {
	if (new TextEncoder().encode(JSON.stringify(value)).length > 8192) {
		throw new TypeError("callerIdentity configuration exceeds its size limit.");
	}
	const configured = record(value, ["profile"], ["companyId", "accountTokens"]);
	if (configured["profile"] !== "poppy-0.3") {
		throw new TypeError("Unsupported caller identity profile.");
	}
	const companyId = Object.hasOwn(configured, "companyId")
		? publicIdentityURL(configured["companyId"])
		: undefined;
	const result: CallerIdentityConfiguration = {
		profile: "poppy-0.3",
		...(companyId === undefined ? {} : { companyId }),
	};
	if (Object.hasOwn(configured, "accountTokens")) {
		const tokens = record(
			configured["accountTokens"],
			["issuer", "audience"],
			["profile", "jwksUri", "algorithms"]
		);
		const issuer = publicIdentityURL(tokens["issuer"]);
		const audience = tokens["audience"];
		if (
			(companyId !== undefined && issuer !== companyId) ||
			typeof audience !== "string" ||
			audience.length > 2048 ||
			hasUnsafeURICharacters(audience) ||
			new URL(audience).hash
		) {
			throw new TypeError("Invalid account token issuer or resource audience.");
		}
		if (Object.hasOwn(tokens, "profile") && tokens["profile"] !== "rfc9068") {
			throw new TypeError("Unsupported account token profile.");
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
			throw new TypeError("Unsupported account token algorithms.");
		}
		result.accountTokens = {
			issuer,
			audience,
			...(Object.hasOwn(tokens, "profile")
				? { profile: "rfc9068" as const }
				: {}),
			...(Object.hasOwn(tokens, "jwksUri")
				? { jwksUri: publicIdentityURL(tokens["jwksUri"]) }
				: {}),
			...(Array.isArray(algorithms)
				? { algorithms: [...algorithms] as ("RS256" | "ES256")[] }
				: {}),
		};
	} else if (companyId === undefined) {
		throw new TypeError("Set companyId when accountTokens is absent.");
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
