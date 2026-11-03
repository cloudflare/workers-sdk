/** Exact URL or explicitly origin-wide API authority for a saved connection. */
export type ConnectionResource = (
	| { url: string; origin?: never }
	| { origin: string; url?: never }
) & {
	methods: ("GET" | "HEAD" | "POST" | "PUT" | "PATCH" | "DELETE")[];
};
export type ExactConnectionResource = Extract<
	ConnectionResource,
	{ url: string }
>;
export interface ConnectionPermissions {
	scope: string[];
	resources: ConnectionResource[];
	inspection_resources?: ExactConnectionResource[];
	return_urls?: string[];
}
export type ConnectionClientRegistration =
	| {
			mode: "existing";
			client_id: string;
			authentication: "none" | "private_key_jwt";
	  }
	| {
			mode: "existing";
			client_id: string;
			authentication: "client_secret_basic";
			credential_reference: string;
	  }
	| {
			mode: "dynamic";
			authentication: "none" | "private_key_jwt" | "client_secret_basic";
			enrollment_credential_reference?: string;
	  };
export interface ConnectionOAuthConfig {
	grant: "authorization_code";
	authorization_server: string;
	/** Optional RFC 8707 indicator. API authority always comes from resources. */
	resource?: string;
	authorization_endpoint?: string;
	token_endpoint?: string;
	revocation_endpoint?: string;
	discovery?: boolean;
	authorization_parameters?: Record<string, string>;
	permission_ceiling: ConnectionPermissions;
	client_registration: ConnectionClientRegistration;
	display_name?: string;
	description?: string;
}
/** Account resource create/reconcile or ID-only attachment. Retain IDs across deploys. */
export type ConnectionBindingConfig = ConnectionPermissions & {
	binding: string;
	selection?: "app" | "customer";
	connection_management?: boolean;
} & (
		| {
				connector_id: string;
				connector_revision: number;
				oauth?: ConnectionOAuthConfig;
		  }
		| {
				connector_id?: never;
				connector_revision?: never;
				oauth: ConnectionOAuthConfig;
		  }
	);

function object(value: unknown): value is Record<string, unknown> {
	return value !== null && typeof value === "object" && !Array.isArray(value);
}
function url(value: unknown, callback = false): value is string {
	if (
		typeof value !== "string" ||
		value.length > 2048 ||
		/[\r\n\t]/.test(value)
	) {
		return false;
	}
	try {
		const u = new URL(value);
		return (
			!u.username &&
			!u.password &&
			!u.hash &&
			(u.protocol === "https:" ||
				(callback && u.protocol === "http:" && u.hostname === "127.0.0.1"))
		);
	} catch {
		return false;
	}
}
function resources(
	value: unknown,
	empty = false,
	exact = false
): value is ConnectionResource[] {
	return (
		Array.isArray(value) &&
		value.length <= 32 &&
		(empty || value.length > 0) &&
		value.every((r) => {
			if (
				!object(r) ||
				Object.keys(r).some((k) => !["url", "origin", "methods"].includes(k))
			) {
				return false;
			}
			if ((r.url === undefined) === (r.origin === undefined)) {
				return false;
			}
			if (r.url !== undefined ? !url(r.url) : exact || !origin(r.origin)) {
				return false;
			}
			return (
				Array.isArray(r.methods) &&
				r.methods.length > 0 &&
				new Set(r.methods).size === r.methods.length &&
				r.methods.every((m) =>
					["GET", "HEAD", "POST", "PUT", "PATCH", "DELETE"].includes(m)
				)
			);
		})
	);
}
function origin(value: unknown): value is string {
	if (!url(value)) {
		return false;
	}
	const u = new URL(value);
	return (
		!u.search &&
		u.pathname === "/" &&
		(value === u.origin || value === u.origin + "/")
	);
}
function subset(child: ConnectionResource[], parent: ConnectionResource[]) {
	return child.every((c) =>
		parent.some(
			(p) =>
				c.methods.every((m) => p.methods.includes(m)) &&
				(p.origin !== undefined
					? new URL(c.url ?? c.origin).origin === new URL(p.origin).origin
					: c.url !== undefined && c.url === p.url)
		)
	);
}
function permissions(
	value: Record<string, unknown>
): value is Record<string, unknown> & ConnectionPermissions {
	return (
		Array.isArray(value.scope) &&
		value.scope.length > 0 &&
		value.scope.length <= 64 &&
		new Set(value.scope).size === value.scope.length &&
		value.scope.every(
			(s) => typeof s === "string" && /^[\x21\x23-\x5b\x5d-\x7e]+$/.test(s)
		) &&
		resources(value.resources) &&
		(value.inspection_resources === undefined ||
			(resources(value.inspection_resources, true, true) &&
				subset(value.inspection_resources, value.resources))) &&
		(value.return_urls === undefined ||
			(Array.isArray(value.return_urls) &&
				value.return_urls.length <= 32 &&
				value.return_urls.every((u) => url(u, true))))
	);
}
function keys(value: Record<string, unknown>, allowed: string[]) {
	return Object.keys(value).every((k) => allowed.includes(k));
}
function reference(value: unknown) {
	return (
		typeof value === "string" &&
		/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/.test(value)
	);
}
function oauth(value: unknown): value is ConnectionOAuthConfig {
	if (
		!object(value) ||
		!keys(value, [
			"grant",
			"authorization_server",
			"resource",
			"authorization_endpoint",
			"token_endpoint",
			"revocation_endpoint",
			"discovery",
			"authorization_parameters",
			"permission_ceiling",
			"client_registration",
			"display_name",
			"description",
		]) ||
		value.grant !== "authorization_code" ||
		!url(value.authorization_server) ||
		(value.resource !== undefined && !url(value.resource))
	) {
		return false;
	}
	if (value.discovery !== undefined && typeof value.discovery !== "boolean") {
		return false;
	}
	for (const name of [
		"authorization_endpoint",
		"token_endpoint",
		"revocation_endpoint",
	]) {
		if (value[name] !== undefined && !url(value[name])) {
			return false;
		}
	}
	if (
		value.discovery !== true &&
		(!value.authorization_endpoint || !value.token_endpoint)
	) {
		return false;
	}
	const ceiling = value.permission_ceiling;
	if (
		!object(ceiling) ||
		!keys(ceiling, [
			"scope",
			"resources",
			"inspection_resources",
			"return_urls",
		]) ||
		!permissions(ceiling)
	) {
		return false;
	}
	const reg = value.client_registration;
	if (
		!object(reg) ||
		!["none", "private_key_jwt", "client_secret_basic"].includes(
			String(reg.authentication)
		)
	) {
		return false;
	}
	if (reg.mode === "existing") {
		if (
			!keys(reg, [
				"mode",
				"client_id",
				"authentication",
				"credential_reference",
			]) ||
			typeof reg.client_id !== "string" ||
			!reg.client_id ||
			reg.client_id.length > 512
		) {
			return false;
		}
		if (
			reg.authentication === "client_secret_basic"
				? !reference(reg.credential_reference)
				: reg.credential_reference !== undefined
		) {
			return false;
		}
	} else if (reg.mode === "dynamic") {
		if (
			!keys(reg, [
				"mode",
				"authentication",
				"enrollment_credential_reference",
			]) ||
			(reg.enrollment_credential_reference !== undefined &&
				!reference(reg.enrollment_credential_reference))
		) {
			return false;
		}
	} else {
		return false;
	}
	if (
		(value.display_name !== undefined &&
			(typeof value.display_name !== "string" ||
				value.display_name.length > 256)) ||
		(value.description !== undefined &&
			(typeof value.description !== "string" ||
				value.description.length > 2048))
	) {
		return false;
	}
	const reserved = new Set([
		"state",
		"scope",
		"client_id",
		"redirect_uri",
		"response_type",
		"code",
		"code_challenge",
		"code_challenge_method",
		"dpop_jkt",
		"access_token",
		"refresh_token",
		"client_secret",
		"request",
		"request_uri",
		"resource",
		"assertion",
		"client_assertion",
		"client_assertion_type",
		"grant_type",
		"code_verifier",
		"nonce",
		"token",
		"token_type_hint",
	]);
	return (
		value.authorization_parameters === undefined ||
		(object(value.authorization_parameters) &&
			Object.entries(value.authorization_parameters).length <= 32 &&
			Object.entries(value.authorization_parameters).every(
				([k, v]) =>
					/^[A-Za-z][A-Za-z0-9_]*$/.test(k) &&
					!reserved.has(k.toLowerCase()) &&
					typeof v === "string" &&
					v.length <= 1024
			))
	);
}
/** Validate public input only; the platform checks account access and pinned ceilings. */
export function isConnectionBinding(
	value: unknown
): value is ConnectionBindingConfig {
	if (
		!object(value) ||
		!keys(value, [
			"binding",
			"connector_id",
			"connector_revision",
			"selection",
			"connection_management",
			"scope",
			"resources",
			"inspection_resources",
			"return_urls",
			"oauth",
		]) ||
		typeof value.binding !== "string" ||
		!/^[A-Za-z0-9_-]{1,128}$/.test(value.binding)
	) {
		return false;
	}
	if (
		value.connector_id !== undefined
			? !reference(value.connector_id) ||
				!Number.isSafeInteger(value.connector_revision) ||
				Number(value.connector_revision) < 1
			: value.connector_revision !== undefined || value.oauth === undefined
	) {
		return false;
	}
	if (
		(value.selection !== undefined &&
			!["app", "customer"].includes(String(value.selection))) ||
		(value.connection_management !== undefined &&
			typeof value.connection_management !== "boolean")
	) {
		return false;
	}
	if (!permissions(value)) {
		return false;
	}
	if (value.oauth !== undefined) {
		if (!oauth(value.oauth)) {
			return false;
		}
		const ceiling = value.oauth.permission_ceiling;
		if (
			!value.scope.every((s) => ceiling.scope.includes(s)) ||
			!subset(value.resources, ceiling.resources) ||
			!subset(
				value.inspection_resources ?? [],
				ceiling.inspection_resources ?? []
			) ||
			!(value.return_urls ?? []).every((u) => ceiling.return_urls?.includes(u))
		) {
			return false;
		}
		const endpoints = [
			value.oauth.authorization_endpoint,
			value.oauth.token_endpoint,
			value.oauth.revocation_endpoint,
		].filter((v): v is string => v !== undefined);
		if (
			value.resources.some(
				(r) =>
					r.url !== undefined &&
					endpoints.some(
						(e) =>
							new URL(e).origin + new URL(e).pathname ===
							new URL(r.url).origin + new URL(r.url).pathname
					)
			)
		) {
			return false;
		}
	}
	return true;
}
