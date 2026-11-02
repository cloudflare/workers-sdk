// Local handler for `/cdn-cgi/image/<options>/<source>` URL transformations.
//
// Mirrors the production pipeline (FL2 -> image-resizing-worker -> IRP) closely
// enough for local development: the per-Worker gate, same-zone and allowed
// origins checks follow FL2/IRW, while the transform itself is the same
// low-fidelity Sharp mock used for `cf.image` fetches.

import { LogLevel, SharedHeaders } from "miniflare:shared";
import { getPublicUrl } from "../shared/public-url";
import { CoreBindings, CoreHeaders, CorePaths } from "./constants";
import type { RequestInitCfPropertiesImage } from "@cloudflare/workers-types/experimental";

export interface ImageUrlTransformationsConfig {
	enabled: boolean;
	allowedOrigins?: string[];
}

interface Env {
	[CoreBindings.SERVICE_LOOPBACK]: Fetcher;
}

// Mirrors IRW's URL regex, operating on the pathname only
const PATH_RE = /^\/cdn-cgi\/image\/(?:(fastly|akamai|flow)\/)?([^/]*)\/(.+)$/;

const RESIZING_VIA_TOKEN = "image-resizing";

let warnedDisabled = false;
let warnedLowFidelity = false;

/**
 * Returns whether `pathname` should be handled as a `/cdn-cgi/image/` URL transformation.
 *
 * @param pathname The request pathname.
 * @returns `true` for paths under `/cdn-cgi/image/`.
 */
export function isImageTransformPath(pathname: string): boolean {
	return (
		pathname === CorePaths.IMAGE_TRANSFORM ||
		pathname.startsWith(`${CorePaths.IMAGE_TRANSFORM}/`)
	);
}

/**
 * Handles a `/cdn-cgi/image/...` request for the Worker the request was routed to.
 *
 * @param request The incoming request.
 * @param url The parsed request URL.
 * @param config The routed Worker's URL transformation config, if any.
 * @param env The entry Worker's environment.
 * @returns The transformed image, or an error response.
 */
export async function handleImageTransform(
	request: Request,
	url: URL,
	config: ImageUrlTransformationsConfig | undefined,
	env: Env
): Promise<Response> {
	// Production returns a 404 for `/cdn-cgi/image/` when transformations aren't
	// enabled, without invoking the Worker
	if (!config?.enabled) {
		await warnOnce(
			env,
			"disabled",
			"`/cdn-cgi/image/` returned 404 because URL transformations are not enabled for this Worker. " +
				"Set `images.url_transformations.enabled` in your Wrangler configuration (or `images.urlTransformations.enabled` in `cloudflare.config.ts`) to enable them."
		);
		return new Response(null, { status: 404 });
	}

	if (request.headers.get("via")?.includes(RESIZING_VIA_TOKEN)) {
		return new Response("ERROR 9403: Request loop detected", { status: 508 });
	}

	const match = PATH_RE.exec(url.pathname);
	if (match === null) {
		return badRequest("Invalid `/cdn-cgi/image/<options>/<source>` URL.");
	}

	const [, adapter, rawOptions, rawSource] = match;
	if (adapter === "fastly" || adapter === "akamai") {
		return badRequest(
			`The \`${adapter}\` URL format is not supported in local development.`
		);
	}

	const sourceUrl = resolveSourceUrl(rawSource + url.search, url);
	if (sourceUrl === null || !isHttpUrl(sourceUrl)) {
		return badRequest("Invalid source image URL.");
	}

	const options = parseImageOptions(rawOptions, request.headers.get("accept"));
	if (options === null) {
		return badRequest("Invalid transformation options.");
	}

	// The local zone isn't known, so unlike production, subdomains of the
	// request hostname aren't considered same-zone
	const sameZone = sourceUrl.hostname === url.hostname;
	const authorization = authorizeSource(sourceUrl, sameZone, config);
	if (!authorization.authorized) {
		return new Response(authorization.reason, { status: 403 });
	}

	const fetched = await fetchSource(request, url, sourceUrl, config, env);
	if (!fetched.ok) {
		return fetched.response;
	}
	const { response: originResponse, url: finalSourceUrl } = fetched;
	if (!originResponse.ok) {
		await originResponse.body?.cancel();
		return notResized(originResponse, finalSourceUrl, url);
	}

	const source = await originResponse.arrayBuffer();

	const form = new FormData();
	form.append("image", new Blob([source]));
	form.append("options", JSON.stringify(options));

	const transformRequest = new Request("http://localhost/cdn-cgi/image", {
		method: "POST",
		body: form,
	});
	transformRequest.headers.set(
		CoreHeaders.CUSTOM_FETCH_SERVICE,
		CoreBindings.IMAGES_FETCH_SERVICE
	);
	const transformed =
		await env[CoreBindings.SERVICE_LOOPBACK].fetch(transformRequest);

	if (!transformed.ok) {
		await transformed.arrayBuffer();
		return notResized(originResponse, finalSourceUrl, url);
	}

	await warnOnce(
		env,
		"low-fidelity",
		"Local `/cdn-cgi/image/` transforms are a low-fidelity mock; only resize, rotate, format conversion and a small set of options are applied. Deploy to preview the full transformation."
	);
	const response = new Response(transformed.body, transformed);
	response.headers.set("content-security-policy", "default-src 'none'");
	return response;
}

const MAX_REDIRECTS = 10;

type FetchSourceResult =
	| { ok: true; response: Response; url: URL }
	| { ok: false; response: Response };

/**
 * Fetches the source image, following redirects manually so that every hop
 * is checked against the Worker's allowed origins.
 */
async function fetchSource(
	request: Request,
	requestUrl: URL,
	sourceUrl: URL,
	config: ImageUrlTransformationsConfig,
	env: Env
): Promise<FetchSourceResult> {
	let publicUrl: URL | undefined;
	let url = sourceUrl;
	for (let redirects = 0; ; redirects++) {
		const sameHost = url.host === requestUrl.host;
		const headers = new Headers(request.headers);
		headers.delete("host");
		for (const name of [...headers.keys()]) {
			if (name.startsWith("mf-")) {
				headers.delete(name);
			}
		}
		// VULN-467: don't send credentials to other origins
		if (!sameHost) {
			headers.delete("cookie");
			headers.delete("authorization");
			headers.delete("proxy-authorization");
		}
		const via = headers.get("via");
		headers.set(
			"via",
			via ? `${via}, ${RESIZING_VIA_TOKEN}` : RESIZING_VIA_TOKEN
		);

		let response: Response;
		try {
			// In production, same-zone source images are fetched back through the
			// zone. Locally, go back through the dev server (or this Miniflare
			// instance) so routing, assets and middleware all apply.
			let target = url;
			if (sameHost) {
				publicUrl ??= await getPublicUrl(env[CoreBindings.SERVICE_LOOPBACK]);
				target = new URL(url.pathname + url.search, publicUrl);
			}
			response = await fetch(
				new Request(target, { headers, redirect: "manual" })
			);
		} catch {
			return {
				ok: false,
				response: new Response("Unable to fetch the source image.", {
					status: 502,
				}),
			};
		}

		const location = response.headers.get("location");
		if (response.status < 300 || response.status >= 400 || location === null) {
			return { ok: true, response, url };
		}
		await response.arrayBuffer();

		let next: URL;
		try {
			next = new URL(location, url);
		} catch {
			return { ok: false, response: badRequest("Invalid redirect URL.") };
		}
		if (redirects >= MAX_REDIRECTS || !isHttpUrl(next)) {
			return { ok: false, response: badRequest("Invalid redirect URL.") };
		}
		const authorization = authorizeSource(
			next,
			next.hostname === requestUrl.hostname,
			config
		);
		if (!authorization.authorized) {
			return {
				ok: false,
				response: new Response(authorization.reason, { status: 403 }),
			};
		}
		url = next;
	}
}

/**
 * Builds the response for a source image that couldn't be transformed,
 * following image-resizing-worker: same-zone requests are redirected to the
 * source, and nothing from cross-zone sources is passed through (VULN-608).
 */
function notResized(
	originResponse: Response,
	sourceUrl: URL,
	requestUrl: URL
): Response {
	const status = originResponse.status;
	const headers = new Headers();
	let responseStatus = status >= 200 && status < 400 ? 500 : status;
	if (sourceUrl.hostname === requestUrl.hostname) {
		headers.set("location", sourceUrl.href);
		responseStatus = 307;
	}
	headers.set("cf-not-resized", "err=9524");
	headers.set("content-type", "text/plain;charset=UTF-8");
	headers.set("content-security-policy", "default-src 'none'");
	return new Response(
		`Error 9524: image could not be resized (${status})`,
		{ status: responseStatus, headers }
	);
}

function isHttpUrl(url: URL): boolean {
	return url.protocol === "http:" || url.protocol === "https:";
}

function badRequest(message: string): Response {
	return new Response(message, { status: 400 });
}

async function warnOnce(
	env: Env,
	kind: "disabled" | "low-fidelity",
	message: string
): Promise<void> {
	if (kind === "disabled") {
		if (warnedDisabled) {
			return;
		}
		warnedDisabled = true;
	} else {
		if (warnedLowFidelity) {
			return;
		}
		warnedLowFidelity = true;
	}
	await env[CoreBindings.SERVICE_LOOPBACK].fetch("http://localhost/core/log", {
		method: "POST",
		headers: { [SharedHeaders.LOG_LEVEL]: LogLevel.WARN.toString() },
		body: message,
	});
}

/**
 * Resolves the source image URL in the same way as image-resizing-worker.
 *
 * @param rawSource The source segment of the path, including any query string.
 * @param requestUrl The `/cdn-cgi/image/` request URL, used to resolve relative sources.
 * @returns The absolute source URL, or `null` if it is invalid.
 */
export function resolveSourceUrl(
	rawSource: string,
	requestUrl: URL
): URL | null {
	let source = rawSource;

	// Sources that have been through `encodeURIComponent()`
	if (/^https?%3a/i.test(source)) {
		try {
			source = decodeURIComponent(source);
		} catch {
			return null;
		}
	}

	try {
		// Paths can have their `//` collapsed by proxies (`https:/example.com`)
		const absolute = /^(https?):\/+(.*)$/i.exec(source);
		if (absolute !== null) {
			return new URL(`${absolute[1]}://${absolute[2]}`);
		}
		return new URL(source, `${requestUrl.protocol}//${requestUrl.host}/`);
	} catch {
		return null;
	}
}

type AuthorizationResult =
	| { authorized: true }
	| { authorized: false; reason: string };

/**
 * Checks whether the source image may be transformed. Same-zone sources are
 * always allowed; `allowedOrigins` lists additional origins, matched in the
 * same way as image-resizing-worker's `isAuthorizedRequest()`.
 *
 * @param sourceUrl The source image URL.
 * @param sameZone Whether the source is on the same host as the request.
 * @param config The Worker's URL transformation config.
 * @returns Whether the source is allowed, and the error body if not.
 */
export function authorizeSource(
	sourceUrl: URL,
	sameZone: boolean,
	config: ImageUrlTransformationsConfig
): AuthorizationResult {
	if (sameZone) {
		return { authorized: true };
	}
	const allowedOrigins = config.allowedOrigins;
	if (allowedOrigins === undefined || allowedOrigins.length === 0) {
		return { authorized: false, reason: "Forbidden" };
	}

	if (allowedOrigins.some((origin) => origin.trim() === "*")) {
		return { authorized: true };
	}

	const isAllowed = allowedOrigins
		.map((origin) => origin.trim())
		.filter(Boolean)
		.flatMap((origin) => {
			try {
				return [
					new URL(/^https?:\/\//.test(origin) ? origin : `https://${origin}`),
				];
			} catch {
				return [];
			}
		})
		.some((allowedUrl) => {
			if (!sourceUrl.pathname.startsWith(allowedUrl.pathname)) {
				return false;
			}
			const allowedHost = allowedUrl.hostname;
			if (allowedHost.startsWith("*.")) {
				return (
					sourceUrl.hostname.endsWith(allowedHost.slice(1)) ||
					sourceUrl.hostname === allowedHost.slice(2)
				);
			}
			return sourceUrl.hostname === allowedHost;
		});

	return isAllowed
		? { authorized: true }
		: {
				authorized: false,
				reason:
					"ERROR 9401: Transformation origin is not in allowed origins list\n",
			};
}

const OPTION_ALIASES: Record<string, string> = {
	w: "width",
	h: "height",
	q: "quality",
	f: "format",
	g: "gravity",
};

const NUMERIC_OPTIONS = new Set(["width", "height", "rotate", "dpr"]);
const STRING_OPTIONS = new Set(["fit", "gravity", "background"]);
const NAMED_QUALITIES = new Set(["low", "medium-low", "medium-high", "high"]);

/**
 * Parses the comma-separated `/cdn-cgi/image/` options into `cf.image`
 * options. Only the subset understood by the local Sharp mock is kept; other
 * options are ignored.
 *
 * @param raw The options segment of the path.
 * @param accept The request's `Accept` header, used to resolve `format=auto`.
 * @returns The `cf.image` options, or `null` if they are invalid.
 */
export function parseImageOptions(
	raw: string,
	accept: string | null
): RequestInitCfPropertiesImage | null {
	let decoded: string;
	try {
		decoded = decodeURIComponent(raw);
	} catch {
		return null;
	}

	const options: Record<string, string | number> = {};
	for (const part of decoded.split(",")) {
		if (part.trim() === "") {
			continue;
		}
		const separator = part.indexOf("=");
		if (separator === -1) {
			return null;
		}
		const rawKey = part.slice(0, separator).trim();
		const key = OPTION_ALIASES[rawKey] ?? rawKey;
		const value = part.slice(separator + 1).trim();

		if (NUMERIC_OPTIONS.has(key)) {
			// `width=auto` relies on client hints, which the local mock ignores
			if ((key === "width" || key === "height") && value === "auto") {
				continue;
			}
			const number = Number(value);
			if (value === "" || !Number.isFinite(number)) {
				return null;
			}
			options[key] = number;
		} else if (key === "quality") {
			const number = Number(value);
			if (value !== "" && Number.isFinite(number)) {
				options[key] = number;
			} else if (NAMED_QUALITIES.has(value)) {
				options[key] = value;
			} else {
				return null;
			}
		} else if (key === "format") {
			const format = value === "auto" ? negotiateFormat(accept) : value;
			if (format !== undefined) {
				options[key] = format;
			}
		} else if (STRING_OPTIONS.has(key)) {
			options[key] = value;
		}
	}

	return options as RequestInitCfPropertiesImage;
}

function negotiateFormat(accept: string | null): string | undefined {
	if (accept === null) {
		return undefined;
	}
	if (/image\/avif/i.test(accept)) {
		return "avif";
	}
	if (/image\/webp/i.test(accept)) {
		return "webp";
	}
	return undefined;
}
