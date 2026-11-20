import {
	isConnectionBinding,
	validIdentityResources,
	type ConnectionBindingConfig,
	type ConnectionResource,
} from "./connections";
export {
	parseCallerIdentity,
	type CallerIdentityConfiguration,
} from "./receiver";
export type {
	ConnectionBindingConfig,
	ConnectionResource,
} from "./connections";
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
	resources: ConnectionResource[];
}
export interface OidcSecretAuthentication {
	method: "client_secret_basic" | "client_secret_post";
	secret_reference: { store_id: string; secret_name: string };
}
export type OidcManagedOAuth = OidcRequestSigning & {
	authorization_server: string;
	token_endpoint?: string;
	http_message_signatures?: "web_bot_auth";
} & (
		| {
				exchange: "workload_authorization";
				client_id?: never;
				authentication?: never;
				token_protection?: never;
				resource: string;
				scope: string[];
		  }
		| {
				exchange: "client_credentials";
				client_id: string;
				authentication?: never;
				token_protection?: never;
				resource: string;
				scope: string[];
		  }
		| {
				exchange: "client_credentials";
				client_id: string;
				authentication: OidcSecretAuthentication;
				token_protection?: "bearer" | "dpop";
				resource?: string;
				scope?: string[];
		  }
	);
export interface WorkloadIdentityBindingConfig {
	binding: string;
	audience?: string;
	subject?: "worker" | "durable-object-namespace";
	namespace_id?: string;
	authorization_grants?: OidcAuthorizationGrants;
	request_signing?: OidcRequestSigning;
	oauth?: OidcManagedOAuth;
	client_authentication?: { client_id: string; audience: string };
}
export type IdentityBindingConfig =
	| WorkloadIdentityBindingConfig
	| ConnectionBindingConfig;
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
	) {
		return false;
	}
	try {
		const u = new URL(value);
		return !!u.hostname && !u.username && !u.password;
	} catch {
		return false;
	}
}
export function validOidcOrigin(value: string): boolean {
	if (!validOidcAuthorizationServer(value)) {
		return false;
	}
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
		record(value) &&
		("connector_id" in value ||
			(record(value.oauth) && value.oauth.grant === "authorization_code"))
	) {
		return isConnectionBinding(value);
	}
	if (
		!record(value) ||
		!fields(value, [
			"binding",
			"audience",
			"subject",
			"namespace_id",
			"authorization_grants",
			"request_signing",
			"oauth",
			"client_authentication",
		]) ||
		typeof value.binding !== "string" ||
		!/^[A-Za-z0-9_-]{1,128}$/.test(value.binding) ||
		(value.audience !== undefined && !validOidcAudience(value.audience))
	) {
		return false;
	}
	const subject = value.subject ?? "worker";
	if (
		subject === "worker"
			? value.namespace_id !== undefined
			: subject !== "durable-object-namespace" ||
				typeof value.namespace_id !== "string" ||
				!/^[A-Za-z0-9_-]{1,128}$/.test(value.namespace_id)
	) {
		return false;
	}
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
	) {
		return false;
	}
	const h = value.request_signing;
	if (
		h !== undefined &&
		(!record(h) ||
			!fields(h, ["resources"]) ||
			!validIdentityResources(h.resources))
	) {
		return false;
	}
	const p = value.oauth;
	const client = value.client_authentication;
	if (
		client !== undefined &&
		(!record(client) ||
			!fields(client, ["client_id", "audience"]) ||
			typeof client.client_id !== "string" ||
			!client.client_id.trim() ||
			new TextEncoder().encode(client.client_id).length > 2048 ||
			Array.from(client.client_id).some(
				(char) => char.charCodeAt(0) < 32 || char.charCodeAt(0) === 127
			) ||
			!validOidcAudience(client.audience))
	) {
		return false;
	}
	if (p !== undefined) {
		if (
			!record(p) ||
			!fields(p, [
				"exchange",
				"client_id",
				"authorization_server",
				"token_endpoint",
				"resource",
				"scope",
				"resources",
				"http_message_signatures",
				"authentication",
				"token_protection",
			]) ||
			!["workload_authorization", "client_credentials"].includes(
				String(p.exchange)
			) ||
			(p.exchange === "client_credentials"
				? typeof p.client_id !== "string" ||
					!p.client_id.trim().length ||
					new TextEncoder().encode(p.client_id).length > 2048 ||
					[...p.client_id].some(
						(c) => c.charCodeAt(0) < 32 || c.charCodeAt(0) === 127
					)
				: p.client_id !== undefined) ||
			typeof p.authorization_server !== "string" ||
			!validOidcAuthorizationServer(p.authorization_server) ||
			(p.token_endpoint !== undefined &&
				(typeof p.token_endpoint !== "string" ||
					!validOidcAuthorizationServer(p.token_endpoint))) ||
			(p.authentication === undefined &&
				(p.resource === undefined ||
					p.scope === undefined ||
					p.token_protection !== undefined)) ||
			(p.authentication !== undefined &&
				(p.exchange !== "client_credentials" ||
					!validSecretAuthentication(p.authentication))) ||
			(p.token_protection !== undefined &&
				!["bearer", "dpop"].includes(String(p.token_protection))) ||
			(p.resource !== undefined &&
				(typeof p.resource !== "string" ||
					!validOidcAudience(p.resource) ||
					!p.resource.includes(":") ||
					p.resource.includes("#") ||
					[...p.resource].some(
						(c) => c.charCodeAt(0) <= 32 || c.charCodeAt(0) === 127
					))) ||
			(p.scope !== undefined &&
				!set(p.scope, (s) => /^[\x21\x23-\x5b\x5d-\x7e]+$/.test(s))) ||
			!validIdentityResources(p.resources) ||
			(p.http_message_signatures !== undefined &&
				p.http_message_signatures !== "web_bot_auth")
		) {
			return false;
		}
		if (
			record(h) &&
			validIdentityResources(h.resources) &&
			validIdentityResources(p.resources) &&
			h.resources.some((a) =>
				(p.resources as ConnectionResource[]).some(
					(b) =>
						new URL(a.url ?? a.origin).origin ===
						new URL(b.url ?? b.origin).origin
				)
			)
		) {
			return false;
		}
	}
	return true;
}

export type {
	ConnectionProtocolRequirements,
	ConnectionOAuthConfig,
	ConnectionClientRegistration,
	ConnectionPermissions,
	ExactConnectionResource,
} from "./connections";

/** Validate a private same-account Secrets Store reference, never secret material. */
export function validSecretAuthentication(
	value: unknown
): value is OidcSecretAuthentication {
	if (
		!record(value) ||
		!fields(value, ["method", "secret_reference"]) ||
		!["client_secret_basic", "client_secret_post"].includes(
			String(value.method)
		)
	) {
		return false;
	}
	const ref = value.secret_reference;
	return (
		record(ref) &&
		fields(ref, ["store_id", "secret_name"]) &&
		typeof ref.store_id === "string" &&
		/^[a-f0-9]{32}$/.test(ref.store_id) &&
		typeof ref.secret_name === "string" &&
		ref.secret_name.length > 0 &&
		new TextEncoder().encode(ref.secret_name).length <= 1024 &&
		[...ref.secret_name].every((c) => c > " " && c !== "\u007f")
	);
}
