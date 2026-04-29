/**
 * Shared utilities for parsing module fallback service requests.
 *
 * The module fallback service supports two protocols:
 * - V1 (legacy): GET request with query params and X-Resolve-Method header
 * - V2 (new_module_registry): POST request with JSON body
 *
 * The protocol version is determined by the `new_module_registry` compatibility flag.
 */
import assert from "node:assert";
import type { Request } from "../../http";

/** V1 protocol request (legacy module registry) */
export interface V1ModuleFallbackRequest {
	protocol: "v1";
	/** Import type: "import" for ES modules, "require" for CommonJS */
	type: "import" | "require";
	/** Module specifier as a path (e.g., "/my-module.js") */
	specifier: string;
	/** Original specifier as written in source code */
	rawSpecifier?: string;
	/** Referrer module path */
	referrer?: string;
}

/** V2 protocol request (new module registry) */
export interface V2ModuleFallbackRequest {
	protocol: "v2";
	/** Import type: includes "internal" for runtime-originated imports */
	type: "import" | "require" | "internal";
	/** Module specifier as a URL (e.g., "file:///bundle/my-module.js") */
	specifier: string;
	/** Original specifier as written in source code */
	rawSpecifier?: string;
	/** Referrer module URL */
	referrer?: string;
	/** Import attributes from the import statement */
	attributes?: Array<{ name: string; value: string }>;
}

/** Discriminated union of both protocol versions */
export type ParsedModuleFallbackRequest =
	| V1ModuleFallbackRequest
	| V2ModuleFallbackRequest;

/**
 * Checks if a request is a module fallback service request.
 * This detects both V1 (GET with X-Resolve-Method header) and V2 (POST) protocols.
 */
export function isModuleFallbackRequest(request: Request): boolean {
	// V1: GET request with X-Resolve-Method header
	if (request.method === "GET" && request.headers.has("X-Resolve-Method")) {
		return true;
	}

	// V2: POST request (the new module registry always uses POST)
	if (request.method === "POST") {
		return true;
	}

	return false;
}

export function assertIsV2ModuleFallbackProtocol(
	body: unknown
): asserts body is Omit<V2ModuleFallbackRequest, "protocol"> {
	assert(typeof body === "object" && body !== null && "specifier" in body);
}

/**
 * Parses a module fallback service request into a protocol-specific format.
 * Automatically detects V1 vs V2 protocol based on HTTP method.
 *
 * @param request - The incoming Request object
 * @returns Parsed request data, or null if the request is malformed
 */
export async function parseModuleFallbackRequest(
	request: Request
): Promise<ParsedModuleFallbackRequest | null> {
	// V1 Protocol: GET with X-Resolve-Method header
	if (request.method === "GET" && request.headers.has("X-Resolve-Method")) {
		const url = new URL(request.url);
		const specifier = url.searchParams.get("specifier");

		if (!specifier) {
			return null;
		}

		const resolveMethod = request.headers.get("X-Resolve-Method");

		return {
			protocol: "v1",
			type: resolveMethod === "require" ? "require" : "import",
			specifier,
			rawSpecifier: url.searchParams.get("rawSpecifier") ?? undefined,
			referrer: url.searchParams.get("referrer") ?? undefined,
		};
	}

	// V2 Protocol: POST with JSON body
	if (request.method === "POST") {
		try {
			const body = await request.json();
			assertIsV2ModuleFallbackProtocol(body);

			return {
				...body,
				protocol: "v2",
			};
		} catch {
			return null;
		}
	}

	return null;
}
