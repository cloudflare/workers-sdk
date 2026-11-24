// Local `/cdn-cgi/image/<options>/<source>` URL transformations, using a
// Sharp-backed mock with support for only basic transforms.

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
	[CoreBindings.IMAGE_URL_TRANSFORMATIONS_FETCH_VIA_PUBLIC_URL]: boolean;
}

type ImageOptions = RequestInitCfPropertiesImage & { onerror?: string };

const PATH_RE = /^\/cdn-cgi\/image\/(?:(fastly|akamai|flow)\/)?([^/]*)\/(.+)$/;

const RESIZING_VIA_TOKEN = "image-resizing";

export type DispatchFetch = (request: Request) => Promise<Response>;

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
 * @param ctx The entry Worker's execution context.
 * @param dispatch Dispatches same-host source requests through local routing.
 * @returns The transformed image, or an error response.
 */
export async function handleImageTransform(
	request: Request,
	url: URL,
	config: ImageUrlTransformationsConfig | undefined,
	env: Env,
	ctx: ExecutionContext,
	dispatch: DispatchFetch
): Promise<Response> {
	if (!config?.enabled) {
		warnOnce(
			env,
			ctx,
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

	const parsed = parseImageOptions(rawOptions, request.headers.get("accept"));
	if (parsed === null) {
		return badRequest("Invalid transformation options.");
	}
	const { onerror, ...options } = parsed;

	// The local zone isn't known, so unlike production, subdomains of the
	// request hostname aren't considered same-zone
	const sameZone = sourceUrl.hostname === url.hostname;
	const authorization = authorizeSource(sourceUrl, sameZone, config);
	if (!authorization.authorized) {
		return new Response(authorization.reason, { status: 403 });
	}

	const fetched = await fetchSource(
		request,
		url,
		sourceUrl,
		config,
		env,
		dispatch
	);
	if (!fetched.ok) {
		return fetched.response;
	}
	const { response: originResponse, url: finalSourceUrl } = fetched;
	if (!originResponse.ok) {
		await originResponse.body?.cancel();
		return notResized(
			originErrorCode(originResponse.status),
			finalSourceUrl,
			url,
			onerror
		);
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
		return notResized(
			{ code: 9412, status: 415, reason: "not an image" },
			finalSourceUrl,
			url,
			onerror
		);
	}

	warnOnce(
		env,
		ctx,
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
	env: Env,
	dispatch: DispatchFetch
): Promise<FetchSourceResult> {
	let publicUrl: Promise<URL> | undefined;
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
			if (
				sameHost &&
				env[CoreBindings.IMAGE_URL_TRANSFORMATIONS_FETCH_VIA_PUBLIC_URL]
			) {
				publicUrl ??= getPublicUrl(env[CoreBindings.SERVICE_LOOPBACK]);
				response = await fetchFromPublicUrl(url, headers, await publicUrl);
			} else if (sameHost) {
				headers.set("host", url.host);
				response = await dispatch(
					new Request(url, { headers, redirect: "manual" })
				);
			} else {
				response = await fetch(
					new Request(url, { headers, redirect: "manual" })
				);
			}
		} catch (error) {
			console.warn("Unable to fetch the source image:", error);
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
 * Fetches a same-host source image from the configured public URL, for dev
 * servers that serve files Miniflare can't see. Other same-host sources are
 * routed within Miniflare, mirroring production fetching them through the zone.
 */
function fetchFromPublicUrl(
	url: URL,
	headers: Headers,
	publicUrl: URL
): Promise<Response> {
	// Assign the path rather than resolving it against the public URL, so a
	// path such as `//example.com/` can't change the host
	const target = new URL(publicUrl);
	target.pathname = url.pathname;
	target.search = url.search;
	return fetch(new Request(target, { headers, redirect: "manual" }));
}

interface ResizeError {
	code: number;
	status: number;
	reason: string;
}

function originErrorCode(status: number): ResizeError {
	const reason = `origin returned ${status}`;
	if (status === 404 || status === 410) {
		return { code: 9404, status, reason };
	}
	if (status >= 400 && status < 500) {
		return { code: 9408, status, reason };
	}
	if (status >= 522 && status <= 524) {
		return { code: 9509, status, reason };
	}
	return { code: 9509, status: 502, reason };
}

/** Builds the response for a source image that couldn't be transformed. */
function notResized(
	error: ResizeError,
	sourceUrl: URL,
	requestUrl: URL,
	onerror: string | undefined
): Response {
	const headers = new Headers({
		"content-type": "text/plain;charset=UTF-8",
		"content-security-policy": "default-src 'none'",
	});
	if (onerror === "redirect" && sourceUrl.hostname === requestUrl.hostname) {
		// A `/.` prefix stops a `//host/` path being read as another origin,
		// while still resolving to the same path
		const path = sourceUrl.pathname.startsWith("//")
			? `/.${sourceUrl.pathname}`
			: sourceUrl.pathname;
		const location =
			sourceUrl.host === requestUrl.host
				? path + sourceUrl.search
				: sourceUrl.href;
		headers.set("location", location);
		headers.set("cf-not-resized", "err=9524");
		return new Response(
			`Error 9524: image could not be resized (${error.reason})`,
			{ status: 307, headers }
		);
	}
	headers.set("cf-resized", `err=${error.code}`);
	return new Response(
		`ERROR ${error.code}: image could not be resized (${error.reason})\n`,
		{ status: error.status, headers }
	);
}

function isHttpUrl(url: URL): boolean {
	return url.protocol === "http:" || url.protocol === "https:";
}

function badRequest(message: string): Response {
	return new Response(message, { status: 400 });
}

function warnOnce(
	env: Env,
	ctx: ExecutionContext,
	kind: "disabled" | "low-fidelity",
	message: string
): void {
	ctx.waitUntil(
		env[CoreBindings.SERVICE_LOOPBACK]
			.fetch("http://localhost/core/log", {
				method: "POST",
				headers: {
					[SharedHeaders.LOG_LEVEL]: LogLevel.WARN.toString(),
					[SharedHeaders.LOG_ONCE]: `image-transform:${kind}`,
				},
				body: message,
			})
			.then(
				(response) => response.body?.cancel(),
				() => {}
			)
	);
}

/**
 * Resolves the source image URL.
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
 * always allowed; `allowedOrigins` lists additional origins.
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
): ImageOptions | null {
	let decoded: string;
	try {
		decoded = decodeURIComponent(raw);
	} catch {
		return null;
	}

	const options: Record<string, string | number> = {};
	for (const part of splitOptions(decoded)) {
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
		// Grouped values such as `gravity=(x=0.5,y=0.5)` aren't supported by
		// the local mock
		if (value.startsWith("(")) {
			continue;
		}

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
		} else if (key === "onerror" || STRING_OPTIONS.has(key)) {
			options[key] = value;
		}
	}

	return options as ImageOptions;
}

/** Splits options on commas outside parentheses, e.g. in `rgb(1,2,3)`. */
function splitOptions(raw: string): string[] {
	const parts: string[] = [];
	let depth = 0;
	let start = 0;
	for (let i = 0; i < raw.length; i++) {
		if (raw[i] === "(") {
			depth++;
		} else if (raw[i] === ")") {
			depth = Math.max(0, depth - 1);
		} else if (raw[i] === "," && depth === 0) {
			parts.push(raw.slice(start, i));
			start = i + 1;
		}
	}
	parts.push(raw.slice(start));
	return parts;
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
