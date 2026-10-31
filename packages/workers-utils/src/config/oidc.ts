/** Validate an exact StringOrURI audience without fetching or normalizing it. */
export function validOidcAudience(value: unknown): value is string {
	if (
		typeof value !== "string" ||
		value.length === 0 ||
		value.length > 2048 ||
		!value.isWellFormed() ||
		/^[\s\u0085]*$/.test(value) ||
		new TextEncoder().encode(value).length > 2048
	) {
		return false;
	}
	const colon = value.indexOf(":");
	if (colon < 0) {
		return true;
	}
	if (/[^\x21-\x7e]/.test(value)) {
		return false;
	}
	if (!/^[A-Za-z][A-Za-z0-9+.-]*$/.test(value.slice(0, colon))) {
		return false;
	}
	// RFC 3986 components match the EWC and native signer grammar. WHATWG URL
	// parsing repairs invalid spellings and rejects valid URIs such as IPvFuture.
	let rest = value.slice(colon + 1);
	const hash = rest.indexOf("#");
	if (hash >= 0) {
		if (!uriComponent(rest.slice(hash + 1), ":@/?")) {
			return false;
		}
		rest = rest.slice(0, hash);
	}
	const question = rest.indexOf("?");
	if (question >= 0) {
		if (!uriComponent(rest.slice(question + 1), ":@/?")) {
			return false;
		}
		rest = rest.slice(0, question);
	}
	if (rest.startsWith("//")) {
		rest = rest.slice(2);
		const slash = rest.indexOf("/");
		const end = slash < 0 ? rest.length : slash;
		if (!uriAuthority(rest.slice(0, end))) {
			return false;
		}
		rest = rest.slice(end);
	}
	return uriComponent(rest, ":@/");
}

function uriComponent(value: string, extra: string): boolean {
	for (let i = 0; i < value.length; i++) {
		const c = value[i];
		if (c === "%") {
			if (!/^[A-Fa-f0-9]{2}$/.test(value.slice(i + 1, i + 3))) {
				return false;
			}
			i += 2;
		} else if (
			!/[A-Za-z0-9]/.test(c) &&
			!"-._~!$&'()*+,;=".includes(c) &&
			!extra.includes(c)
		) {
			return false;
		}
	}
	return true;
}

function uriAuthority(value: string): boolean {
	const at = value.indexOf("@");
	if (at >= 0) {
		if (!uriComponent(value.slice(0, at), ":")) {
			return false;
		}
		value = value.slice(at + 1);
	}
	if (value.startsWith("[")) {
		const end = value.indexOf("]");
		if (end < 0 || !ipLiteral(value.slice(1, end))) {
			return false;
		}
		value = value.slice(end + 1);
		if (value === "") {
			return true;
		}
		if (!value.startsWith(":")) {
			return false;
		}
	} else {
		const colon = value.indexOf(":");
		if (colon < 0) {
			return uriComponent(value, "");
		}
		if (!uriComponent(value.slice(0, colon), "")) {
			return false;
		}
		value = value.slice(colon);
	}
	return !/[^0-9]/.test(value.slice(1));
}

function ipLiteral(value: string): boolean {
	if (/^[vV]/.test(value)) {
		const dot = value.indexOf(".");
		return (
			dot > 1 &&
			dot + 1 < value.length &&
			/^[A-Fa-f0-9]+$/.test(value.slice(1, dot)) &&
			!value.includes("%") &&
			uriComponent(value.slice(dot + 1), ":")
		);
	}
	let groups = 0;
	let compressed = value.startsWith("::");
	if (compressed) {
		value = value.slice(2);
	}
	while (value.length > 0) {
		const colon = value.indexOf(":");
		const end = colon < 0 ? value.length : colon;
		const group = value.slice(0, end);
		if (group.includes(".")) {
			const octets = group.split(".");
			return (
				end === value.length &&
				(compressed ? groups < 6 : groups === 6) &&
				octets.length === 4 &&
				octets.every(
					(octet) => /^(0|[1-9][0-9]{0,2})$/.test(octet) && Number(octet) <= 255
				)
			);
		}
		if (!/^[A-Fa-f0-9]{1,4}$/.test(group) || ++groups > 8) {
			return false;
		}
		if (end === value.length) {
			break;
		}
		value = value.slice(end + 1);
		if (value.startsWith(":")) {
			if (compressed) {
				return false;
			}
			compressed = true;
			value = value.slice(1);
		} else if (value === "") {
			return false;
		}
	}
	return compressed ? groups < 8 : groups === 8;
}

export interface OidcAuthorizationGrants {
	allowed_authorization_servers: string[];
	allowed_scopes: string[];
}
export interface OidcRequestSigning {
	profile: "cloudflare-workload-http-v1";
	allowed_origins: string[];
	allowed_methods: string[];
}
export interface IdentityBindingConfig {
	binding: string;
	audience: string;
	subject?: "worker" | "durable-object-namespace";
	namespace_id?: string;
	authorization_grants?: OidcAuthorizationGrants;
	request_signing?: OidcRequestSigning;
}
function record(value: unknown): value is Record<string, unknown> {
	return !!value && typeof value === "object" && !Array.isArray(value);
}
function fields(value: Record<string, unknown>, allowed: string[]) {
	return Reflect.ownKeys(value).every(
		(k) => typeof k === "string" && allowed.includes(k)
	);
}
function set(
	value: unknown,
	validate: (s: string) => boolean,
	empty = false
): value is string[] {
	return (
		Array.isArray(value) &&
		value.length <= 64 &&
		(empty || value.length > 0) &&
		new Set(value).size === value.length &&
		value.every((s) => typeof s === "string" && validate(s))
	);
}
export function validOidcAuthorizationServer(value: string): boolean {
	if (
		!validOidcAudience(value) ||
		!value.startsWith("https://") ||
		/[?#]/.test(value)
	)
		return false;
	try {
		const u = new URL(value);
		return !!u.hostname && !u.username && !u.password;
	} catch {
		return false;
	}
}
export function validOidcOrigin(value: string): boolean {
	if (!validOidcAuthorizationServer(value)) return false;
	try {
		return new URL(value).origin === value;
	} catch {
		return false;
	}
}
/** Validate only configured limits. EWC supplies trusted origin properties. */
export function isIdentityBinding(
	value: unknown
): value is IdentityBindingConfig {
	if (
		!record(value) ||
		!fields(value, [
			"binding",
			"audience",
			"subject",
			"namespace_id",
			"authorization_grants",
			"request_signing",
		]) ||
		typeof value.binding !== "string" ||
		!/^[A-Za-z0-9_-]{1,128}$/.test(value.binding) ||
		!validOidcAudience(value.audience)
	)
		return false;
	const subject = value.subject ?? "worker";
	if (
		subject === "worker"
			? value.namespace_id !== undefined
			: subject !== "durable-object-namespace" ||
				typeof value.namespace_id !== "string" ||
				!/^[A-Za-z0-9_-]{1,128}$/.test(value.namespace_id)
	)
		return false;
	const g = value.authorization_grants;
	if (
		g !== undefined &&
		(!record(g) ||
			!fields(g, ["allowed_authorization_servers", "allowed_scopes"]) ||
			!set(g.allowed_authorization_servers, validOidcAuthorizationServer) ||
			!set(
				g.allowed_scopes,
				(s) => /^[\x21\x23-\x5b\x5d-\x7e]+$/.test(s),
				true
			))
	)
		return false;
	const h = value.request_signing;
	if (
		h !== undefined &&
		(!record(h) ||
			!fields(h, ["profile", "allowed_origins", "allowed_methods"]) ||
			h.profile !== "cloudflare-workload-http-v1" ||
			!set(h.allowed_origins, validOidcOrigin) ||
			!set(
				h.allowed_methods,
				(s) =>
					/^[A-Z!#$%&'*+.^_`|~-]+$/.test(s) &&
					!["CONNECT", "TRACE", "TRACK"].includes(s)
			))
	)
		return false;
	return true;
}
