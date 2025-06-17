import { blue, bold, green, grey, red, reset, yellow } from "kleur/colors";
import { HttpError, LogLevel, SharedHeaders } from "miniflare:shared";
import { parseForwardedProto } from "../../shared/forwarded-proto";
import { isCompressedByCloudflareFL } from "../../shared/mime-types";
import {
	CoreBindings,
	CoreHeaders,
	CorePaths,
	decodeErrorPayload,
} from "./constants";
import { handleEmail } from "./email";
import { STATUS_CODES } from "./http";
import { matchRoutes } from "./routing";
import { handleScheduled } from "./scheduled";
import type { EmailStoreService } from "../email/storage";
import type { WorkerRoute } from "./routing";
import type { Colorize } from "kleur/colors";

type Env = {
	[CoreBindings.SERVICE_LOOPBACK]: Fetcher;
	[CoreBindings.SERVICE_EMAIL_STORE]: EmailStoreService;
	[CoreBindings.SERVICE_USER_FALLBACK]: Fetcher;
	[CoreBindings.TEXT_FALLBACK_WORKER_NAME]: string;
	[CoreBindings.SERVICE_LOCAL_EXPLORER]: Fetcher;
	[CoreBindings.SERVICE_STREAM]?: Fetcher;
	[CoreBindings.SERVICE_IMAGES_DELIVERY]?: Fetcher;
	[CoreBindings.SERVICE_R2_PUBLIC]?: Fetcher;
	[CoreBindings.SERVICE_R2_S3]?: Fetcher;
	[CoreBindings.TEXT_CUSTOM_SERVICE]: string;
	[CoreBindings.TEXT_UPSTREAM_URL]?: string;
	[CoreBindings.JSON_CF_BLOB]: IncomingRequestCfProperties;
	[CoreBindings.TEXT_FALLBACK_WORKER_NAME]: string;
	[CoreBindings.JSON_ROUTES]: WorkerRoute[];
	[CoreBindings.JSON_LOG_LEVEL]: LogLevel;
	[CoreBindings.DURABLE_OBJECT_NAMESPACE_PROXY]: DurableObjectNamespace;
	[CoreBindings.DATA_PROXY_SHARED_SECRET]?: ArrayBuffer;
	[CoreBindings.TRIGGER_HANDLERS]: boolean;
	[CoreBindings.LOG_REQUESTS]: boolean;
	[CoreBindings.STRIP_DISABLE_PRETTY_ERROR]: boolean;
} & {
	[K in `${typeof CoreBindings.SERVICE_USER_ROUTE_PREFIX}${string}`]:
		| Fetcher
		| undefined; // Won't have a `Fetcher` for every possible `string`
} & {
	[K in `${typeof CoreBindings.JSON_ACCESS_BLOB_PREFIX}${string}`]:
		| { app_aud: string; jwt_claims?: Record<string, unknown> }
		| undefined;
};

const encoder = new TextEncoder();

function getUserRequest(
	request: Request<unknown, IncomingRequestCfProperties>,
	env: Env,
	clientIp: string | undefined
) {
	// The ORIGINAL_URL header is added to outbound requests from Miniflare,
	// triggered either by calling Miniflare.#dispatchFetch(request),
	// or as part of a loopback request in a Custom Service.
	// The ORIGINAL_URL is extracted from the `request` being sent.
	// This is relevant here in the case that a Miniflare implemented Proxy Worker is
	// sitting in front of this User Worker, which is hosted on a different URL.
	const originalUrl = request.headers.get(CoreHeaders.ORIGINAL_URL);
	let url = new URL(originalUrl ?? request.url);
	// Match the Vite dev server's handling of TLS-terminating proxies. Explicit
	// URLs supplied by dispatchFetch() or another dev proxy remain authoritative.
	if (originalUrl === null) {
		const protocol = parseForwardedProto(
			request.headers.get("X-Forwarded-Proto")
		);
		if (protocol !== undefined) {
			url.protocol = protocol;
			// Parsing request.url may have removed a default port for the physical
			// protocol. Restore the original authority after changing the scheme.
			url.host = request.headers.get("Host") ?? url.host;
		}
	}

	let rewriteHeadersFromOriginalUrl = false;

	// If the request is signed by a proxy server then we can use the Host and Origin from the ORIGINAL_URL.
	// The shared secret is required to prevent a malicious user being able to change the headers without permission.
	const proxySharedSecret = request.headers.get(
		CoreHeaders.PROXY_SHARED_SECRET
	);
	if (proxySharedSecret) {
		const secretFromHeader = encoder.encode(proxySharedSecret);
		const configuredSecret = env[CoreBindings.DATA_PROXY_SHARED_SECRET];
		if (
			secretFromHeader.byteLength === configuredSecret?.byteLength &&
			crypto.subtle.timingSafeEqual(secretFromHeader, configuredSecret)
		) {
			rewriteHeadersFromOriginalUrl = true;
		} else {
			throw new HttpError(
				400,
				`Disallowed header in request: ${CoreHeaders.PROXY_SHARED_SECRET}=${proxySharedSecret}`
			);
		}
	}

	// If Miniflare was configured with `upstream`, then we use this to override the url and host in the request.
	const upstreamUrl = env[CoreBindings.TEXT_UPSTREAM_URL];
	// Store the original hostname before it gets rewritten by upstream
	const originalHostname = upstreamUrl !== undefined ? url.host : undefined;
	if (upstreamUrl !== undefined) {
		// If a custom `upstream` was specified, make sure the URL starts with it
		let path = url.pathname + url.search;
		// Remove leading slash, so we resolve relative to `upstream`'s path
		if (path.startsWith("/")) {
			path = `./${path.substring(1)}`;
		}
		url = new URL(path, upstreamUrl);
		rewriteHeadersFromOriginalUrl = true;
	}

	// Note when constructing new `Request`s from `request`, we must always pass
	// `request` as is to the `new Request()` constructor. Whilst prohibited by
	// the `Request` API spec, `GET` requests are allowed to have bodies. If
	// `Content-Length` or `Transfer-Encoding` are specified, `workerd` will give
	// the request a (potentially empty) body. Passing a bodied-GET-request
	// through to the `new Request()` constructor should throw, but `workerd` has
	// special handling to allow this if a `Request` instance is passed.
	// See https://github.com/cloudflare/workerd/issues/1122 for more details.
	request = new Request(url, request);

	// `Accept-Encoding` is always set to "br, gzip" in Workers:
	// https://developers.cloudflare.com/fundamentals/reference/http-request-headers/#accept-encoding
	request.headers.set("Accept-Encoding", "br, gzip");

	const secFetchMode = request.headers.get(CoreHeaders.SEC_FETCH_MODE);
	if (secFetchMode) {
		request.headers.set("Sec-Fetch-Mode", secFetchMode);
	}
	request.headers.delete(CoreHeaders.SEC_FETCH_MODE);

	if (rewriteHeadersFromOriginalUrl) {
		request.headers.set("Host", url.host);
	}

	// Set the original hostname header when using upstream, so Workers can
	// access the original hostname even after the Host header is rewritten
	if (originalHostname !== undefined) {
		request.headers.set(CoreHeaders.ORIGINAL_HOSTNAME, originalHostname);
	}

	if (clientIp && !request.headers.get("CF-Connecting-IP")) {
		const ipv4Regex = /(?<ip>.*?):\d+/;
		const ipv6Regex = /\[(?<ip>.*?)\]:\d+/;
		const ip =
			clientIp.match(ipv6Regex)?.groups?.ip ??
			clientIp.match(ipv4Regex)?.groups?.ip;

		if (ip) {
			request.headers.set("CF-Connecting-IP", ip);
		}
	}

	request.headers.delete(CoreHeaders.PROXY_SHARED_SECRET);
	request.headers.delete(CoreHeaders.ORIGINAL_URL);
	if (env[CoreBindings.STRIP_DISABLE_PRETTY_ERROR]) {
		request.headers.delete(CoreHeaders.DISABLE_PRETTY_ERROR);
	}
	return request;
}

function getTargetService(
	request: Request,
	url: URL,
	env: Env
): { service: Fetcher | undefined; routeTarget: string } {
	const override = request.headers.get(CoreHeaders.ROUTE_OVERRIDE);
	request.headers.delete(CoreHeaders.ROUTE_OVERRIDE);

	const route = override ?? matchRoutes(env[CoreBindings.JSON_ROUTES], url);
	if (route !== null) {
		return {
			service: env[`${CoreBindings.SERVICE_USER_ROUTE_PREFIX}${route}`],
			routeTarget: route,
		};
	}
	return {
		service: env[CoreBindings.SERVICE_USER_FALLBACK],
		routeTarget: env[CoreBindings.TEXT_FALLBACK_WORKER_NAME],
	};
}

const LOCALHOST_HOSTNAMES = ["localhost", "127.0.0.1", "[::1]"];

function isCdnCgiRequest(url: string | null): boolean {
	if (url === null) {
		return false;
	}

	try {
		return new URL(url).pathname.startsWith("/cdn-cgi/");
	} catch {
		return false;
	}
}

/**
 * Validates that a request to a /cdn-cgi/* endpoint originates from an allowed host.
 * This check must happen BEFORE any header rewriting (getUserRequest) to ensure
 * we're checking the actual browser-sent headers, not Miniflare rewritten ones.
 */
function validateCdnCgiRequest(
	request: Request,
	routes: WorkerRoute[],
	upstreamUrl: string | undefined
): void {
	if (
		!isCdnCgiRequest(request.url) &&
		!isCdnCgiRequest(request.headers.get(CoreHeaders.ORIGINAL_URL))
	) {
		return;
	}

	// Subdomain matching should only apply to wildcard routes (e.g.
	// "*.example.com/*"). Exact routes and the configured upstream hostname
	// must match the request hostname exactly.
	const exactHostnames = new Set<string>();
	const wildcardHostnames = new Set<string>();
	for (const route of routes) {
		// route.hostname has already had the leading "*" stripped by parseRoutes,
		// but wildcard routes still carry a leading "." (e.g., "*.example.com" -> ".example.com")
		const hostname = route.hostname.replace(/^\./, "");
		if (!hostname) {
			continue;
		}
		if (route.allowHostnamePrefix) {
			wildcardHostnames.add(hostname);
		} else {
			exactHostnames.add(hostname);
		}
	}
	// Upstream is a single configured host, not a wildcard.
	if (upstreamUrl) {
		try {
			const upstreamHostname = new URL(upstreamUrl).hostname;
			if (upstreamHostname) {
				exactHostnames.add(upstreamHostname);
			}
		} catch {
			// Ignore invalid upstream URL
		}
	}

	const hostHeader = request.headers.get("Host");
	let hostHostname: string;
	if (hostHeader) {
		try {
			hostHostname = new URL(`http://${hostHeader}`).hostname;
		} catch {
			throw new HttpError(403, "Invalid Host header");
		}
		if (!isHostnameAllowed(hostHostname, exactHostnames, wildcardHostnames)) {
			throw new HttpError(403, "Invalid Host header");
		}
	}

	const origin = request.headers.get("Origin");
	if (origin) {
		let originHostname: string;
		try {
			originHostname = new URL(origin).hostname;
		} catch {
			throw new HttpError(403, "Invalid Origin header");
		}
		if (!isHostnameAllowed(originHostname, exactHostnames, wildcardHostnames)) {
			throw new HttpError(403, "Invalid Origin header");
		}
	}
}

/**
 * Checks whether a hostname is allowed.
 * - exactHostnames: must match exactly (configured non-wildcard routes, upstream)
 * - wildcardHostnames: also match any subdomain (for wildcard routes like *.example.com)
 *
 * Localhost hostnames are always allowed.
 */
function isHostnameAllowed(
	hostname: string,
	exactHostnames: Set<string>,
	wildcardHostnames: Set<string>
): boolean {
	if (LOCALHOST_HOSTNAMES.includes(hostname)) {
		return true;
	}
	if (exactHostnames.has(hostname)) {
		return true;
	}
	for (const allowed of wildcardHostnames) {
		// Match the base domain or any subdomain
		if (hostname === allowed || hostname.endsWith(`.${allowed}`)) {
			return true;
		}
	}
	return false;
}

function maybePrettifyError(request: Request, response: Response, env: Env) {
	if (
		response.status !== 500 ||
		response.headers.get(CoreHeaders.ERROR_STACK) === null
	) {
		return response;
	}

	// `workerd` drops response bodies for `HEAD` requests, so fall back to the
	// header copy of the serialised error. Without a payload there is nothing to
	// prettify, and POSTing an empty body would surface a JSON parse error from
	// miniflare's internals instead of the user's error.
	const body = response.body ?? decodeErrorPayload(response);
	if (body === null) {
		return response;
	}

	return env[CoreBindings.SERVICE_LOOPBACK].fetch(
		"http://localhost/core/error",
		{
			method: "POST",
			headers: request.headers,
			body,
			cf: { prettyErrorOriginalUrl: request.url },
		}
	);
}

const acceptEncodingElement =
	/^(?<coding>[a-z]+|\*)(?:\s*;\s*q=(?<weight>\d+(?:.\d+)?))?$/;
interface AcceptedEncoding {
	coding: string;
	weight: number;
}

/**
 * Tries to parse an `Accept-Encoding` element, returning an object with
 * `coding` and `weight` properties, or `undefined` if the element is invalid.
 *
 * The `coding` is set to `"identity"` if the coding is `"*"`, and the `weight`
 * is set to `1` if not specified.
 */
function maybeParseAcceptEncodingElement(
	element: string
): AcceptedEncoding | undefined {
	const match = acceptEncodingElement.exec(element);
	if (match?.groups == null) return;
	return {
		coding: match.groups.coding === "*" ? "identity" : match.groups.coding,
		weight:
			match.groups.weight === undefined ? 1 : parseFloat(match.groups.weight),
	};
}

/**
 * Parses the accept-encoding header, returning an array of tuples
 * containing the encoding and its weight, sorted by weight in descending order.
 */
function parseAcceptEncoding(header: string) {
	const encodings = new Map([["identity", 1]]);
	for (const element of header.split(",")) {
		const maybeEncoding = maybeParseAcceptEncodingElement(element.trim());
		if (maybeEncoding !== undefined) {
			encodings.set(maybeEncoding.coding, maybeEncoding.weight);
		}
	}
	// `Array#sort()` is stable, so original ordering preserved for same weights
	return Array.from(encodings).sort((a, b) => b[1] - a[1]);
}

/**
 * Ensures that the response has an acceptable `Content-Encoding` header
 * based on the `Accept-Encoding` header from the client.
 *
 * If the client does not accept any of the supported encodings,
 * it returns a 415 Unsupported Media Type response.
 *
 * If the response already has a `Content-Encoding` header that is acceptable,
 * it prefers this over the encoding with the highest weight from the `Accept-Encoding` header.
 */
function ensureAcceptableEncoding(
	clientAcceptEncoding: string | null,
	response: Response
): Response {
	// https://www.rfc-editor.org/rfc/rfc9110#section-12.5.3

	const supportedEncodings = ["gzip", "br", "identity"];
	const contentEncoding =
		response.headers.get("Content-Encoding") ?? "identity";
	const contentType = response.headers.get("Content-Type");

	if (!supportedEncodings.includes(contentEncoding)) {
		return response; // If the encoding is not supported, return the response as is
	}

	response = new Response(response.body, response); // Ensure mutable headers
	response.headers.delete("Content-Encoding"); // Use identity by default

	// if cloudflare's FL does not compress this mime-type, then don't compress locally either
	if (!isCompressedByCloudflareFL(contentType)) {
		return response;
	}

	// If the client hasn't specified any acceptable encodings, go with `identity` encoding
	if (clientAcceptEncoding === null) {
		return response;
	}

	const acceptableEncodings = parseAcceptEncoding(clientAcceptEncoding);

	const acceptedEncoding =
		// If the content encoding from the response is acceptable, use it (this is the case when the Worker has set a `Content-Encoding` header)
		acceptableEncodings.find(
			([coding, weight]) => contentEncoding === coding && weight > 0
		) ??
		// Otherwise take the first supported acceptable encoding, since they are sorted by weight
		acceptableEncodings.find(
			([coding, weight]) => supportedEncodings.includes(coding) && weight > 0
		);

	if (acceptedEncoding === undefined) {
		// If the client doesn't accept any of our supported encodings, including blocking identity, return 415
		return new Response("Unsupported Media Type", {
			status: 415 /* Unsupported Media Type */,
			headers: { "Accept-Encoding": "br, gzip" },
		});
	}

	const [encoding] = acceptedEncoding;
	if (encoding !== "identity") {
		response.headers.set("Content-Encoding", encoding); // Use desired encoding
	}

	return response;
}

function colourFromHTTPStatus(status: number): Colorize {
	if (200 <= status && status < 300) {
		return green;
	}
	if (400 <= status && status < 500) {
		return yellow;
	}
	if (500 <= status) {
		return red;
	}
	return blue;
}

const ADDITIONAL_RESPONSE_LOG_HEADER_NAME = "X-Mf-Additional-Response-Log";

function maybeLogRequest(
	req: Request,
	res: Response,
	env: Env,
	ctx: ExecutionContext,
	startTime: number
): Response {
	res = new Response(res.body, res); // Ensure mutable headers
	const additionalResponseLog = res.headers.get(
		ADDITIONAL_RESPONSE_LOG_HEADER_NAME
	);
	res.headers.delete(ADDITIONAL_RESPONSE_LOG_HEADER_NAME);

	if (env[CoreBindings.JSON_LOG_LEVEL] < LogLevel.INFO) {
		return res;
	}

	const url = new URL(req.url);
	const statusText = (res.statusText.trim() || STATUS_CODES[res.status]) ?? "";
	const lines = [
		`${bold(req.method)} ${url.pathname} `,
		colourFromHTTPStatus(res.status)(`${bold(res.status)} ${statusText} `),
		grey(`(${Date.now() - startTime}ms)`),
	];
	if (additionalResponseLog) {
		lines.push(` ${grey(additionalResponseLog)}`);
	}
	const message = reset(lines.join(""));

	ctx.waitUntil(
		env[CoreBindings.SERVICE_LOOPBACK].fetch("http://localhost/core/log", {
			method: "POST",
			headers: { [SharedHeaders.LOG_LEVEL]: LogLevel.INFO.toString() },
			body: message,
		})
	);

	return res;
}

/**
 * Proxy here refers to the 'magic proxy' used by getPlatformProxy
 */
function handleProxy(request: Request, env: Env) {
	const ns = env[CoreBindings.DURABLE_OBJECT_NAMESPACE_PROXY];
	// Always use the same singleton Durable Object instance, so we always have
	// access to the same "heap"
	const id = ns.idFromName("");
	const stub = ns.get(id);
	return stub.fetch(request);
}

export default <ExportedHandler<Env>>{
	async fetch(request, env, ctx) {
		const startTime = Date.now();

		const clientIp = request.cf?.clientIp as string;

		// Parse this manually (rather than using the `cfBlobHeader` config property in workerd to parse it into request.cf)
		// This is because we want to have access to the clientIp, which workerd puts in request.cf if no cfBlobHeader is provided
		const clientCfBlobHeader = request.headers.get(CoreHeaders.CF_BLOB);

		const cf: IncomingRequestCfProperties = clientCfBlobHeader
			? JSON.parse(clientCfBlobHeader)
			: {
					...env[CoreBindings.JSON_CF_BLOB],
					// Defaulting to empty string to preserve undefined `Accept-Encoding`
					// through Wrangler's proxy worker.
					clientAcceptEncoding: request.headers.get("Accept-Encoding") ?? "",
				};
		request = new Request(request, { cf });

		// Strip any client-supplied Access blob header early, before branches
		// that return without calling getUserRequest() (e.g. the magic proxy).
		// The correct per-worker blob is injected later after routing.
		request.headers.delete(CoreHeaders.ACCESS_BLOB);

		// Restrict /cdn-cgi/* requests to allowed hostnames.
		// These endpoints should be served only when the browser-sent Host and
		// Origin headers match localhost, a configured route, or the configured upstream.
		// This must happen before getUserRequest() so we validate the
		// original browser-sent headers, not Miniflare-rewritten ones.
		const requestUrl = new URL(request.url);
		try {
			validateCdnCgiRequest(
				request,
				env[CoreBindings.JSON_ROUTES],
				env[CoreBindings.TEXT_UPSTREAM_URL]
			);
		} catch (e) {
			if (e instanceof HttpError) {
				return e.toResponse();
			}
			throw e;
		}

		// The magic proxy client (used by getPlatformProxy)
		if (requestUrl.pathname === CorePaths.PLATFORM_PROXY) {
			if (request.headers.get(CoreHeaders.OP) !== null) {
				return handleProxy(request, env);
			}

			return new Response("Invalid proxy request", { status: 400 });
		}

		// `dispatchFetch()` will always inject this header. When
		// calling this function, we never want to display the pretty-error page.
		// Instead, we propagate the error and reject the returned `Promise`.
		const disablePrettyErrorPage =
			request.headers.get(CoreHeaders.DISABLE_PRETTY_ERROR) !== null;

		const clientAcceptEncoding = request.headers.get("Accept-Encoding");

		try {
			request = getUserRequest(request, env, clientIp);
		} catch (e) {
			if (e instanceof HttpError) {
				return e.toResponse();
			}
			throw e;
		}
		const url = new URL(request.url);
		const { service, routeTarget } = getTargetService(request, url, env);
		if (service === undefined) {
			return new Response("No entrypoint worker found", { status: 404 });
		}

		try {
			if (env[CoreBindings.SERVICE_LOCAL_EXPLORER]) {
				if (
					url.pathname === CorePaths.EXPLORER ||
					url.pathname.startsWith(`${CorePaths.EXPLORER}/`)
				) {
					return await env[CoreBindings.SERVICE_LOCAL_EXPLORER].fetch(request);
				}
			}
			const imagesDelivery = env[CoreBindings.SERVICE_IMAGES_DELIVERY];
			if (
				(url.pathname === CorePaths.IMAGE_DELIVERY ||
					url.pathname.startsWith(`${CorePaths.IMAGE_DELIVERY}/`) ||
					url.pathname === CorePaths.IMAGE_UPLOAD ||
					url.pathname.startsWith(`${CorePaths.IMAGE_UPLOAD}/`)) &&
				imagesDelivery
			) {
				return await imagesDelivery.fetch(request);
			}
			if (env[CoreBindings.TRIGGER_HANDLERS]) {
				if (url.pathname === CorePaths.SCHEDULED) {
					return await handleScheduled(url.searchParams, service);
				}

				if (url.pathname === CorePaths.EMAIL) {
					return await handleEmail(
						url.searchParams,
						request,
						service,
						routeTarget,
						env,
						ctx
					);
				}
			}

			const streamService = env[CoreBindings.SERVICE_STREAM];
			if (
				(url.pathname === CorePaths.STREAM_VIDEO ||
					url.pathname.startsWith(`${CorePaths.STREAM_VIDEO}/`)) &&
				streamService
			) {
				return await streamService.fetch(request);
			}

			const r2PublicService = env[CoreBindings.SERVICE_R2_PUBLIC];
			if (
				(url.pathname === CorePaths.R2_PUBLIC ||
					url.pathname.startsWith(`${CorePaths.R2_PUBLIC}/`)) &&
				r2PublicService
			) {
				return await r2PublicService.fetch(request);
			}

			const r2S3Service = env[CoreBindings.SERVICE_R2_S3];
			if (
				(url.pathname === CorePaths.R2_S3 ||
					url.pathname.startsWith(`${CorePaths.R2_S3}/`)) &&
				r2S3Service
			) {
				// SigV4 verification compares against the host the client
				// signed, so undo the `upstream` URL/Host rewrite from
				// `getUserRequest()`
				let s3Request = request;
				const originalHostname = request.headers.get(
					CoreHeaders.ORIGINAL_HOSTNAME
				);
				if (originalHostname !== null) {
					const s3Url = new URL(url);
					s3Url.host = originalHostname;
					s3Request = new Request(s3Url, request);
					s3Request.headers.set("Host", originalHostname);
				}
				if (clientAcceptEncoding === null) {
					s3Request.headers.delete("Accept-Encoding");
				} else {
					s3Request.headers.set("Accept-Encoding", clientAcceptEncoding);
				}
				return await r2S3Service.fetch(s3Request);
			}

			// Inject per-worker Cloudflare Access blob header so workerd populates ctx.access
			const accessBlob =
				env[`${CoreBindings.JSON_ACCESS_BLOB_PREFIX}${routeTarget}`];
			if (accessBlob) {
				const headers = new Headers(request.headers);
				headers.set(CoreHeaders.ACCESS_BLOB, JSON.stringify(accessBlob));
				request = new Request(request, { headers });
			}

			let response = await service.fetch(request);
			if (!disablePrettyErrorPage) {
				response = await maybePrettifyError(request, response, env);
			}
			response = ensureAcceptableEncoding(clientAcceptEncoding, response);
			if (env[CoreBindings.LOG_REQUESTS]) {
				response = maybeLogRequest(request, response, env, ctx, startTime);
			}
			return response;
		} catch (e: any) {
			return new Response(e?.stack ?? String(e), { status: 500 });
		}
	},
};

export { ProxyServer } from "./proxy.worker";
