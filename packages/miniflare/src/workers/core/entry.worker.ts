import {
	blue,
	bold,
	Colorize,
	green,
	grey,
	red,
	reset,
	yellow,
} from "kleur/colors";
import { HttpError, LogLevel, SharedHeaders } from "miniflare:shared";
import { isCompressedByCloudflareFL } from "../../shared/mime-types";
import { CoreBindings, CoreHeaders } from "./constants";
import { handleEmail } from "./email";
import { STATUS_CODES } from "./http";
import { matchRoutes, WorkerRoute } from "./routing";
import { handleScheduled } from "./scheduled";

type Env = {
	[CoreBindings.SERVICE_LOOPBACK]: Fetcher;
	[CoreBindings.SERVICE_USER_FALLBACK]: Fetcher;
	[CoreBindings.SERVICE_LOCAL_EXPLORER]: Fetcher;
	[CoreBindings.TEXT_CUSTOM_SERVICE]: string;
	[CoreBindings.TEXT_UPSTREAM_URL]?: string;
	[CoreBindings.JSON_CF_BLOB]: IncomingRequestCfProperties;
	[CoreBindings.JSON_ROUTES]: WorkerRoute[];
	[CoreBindings.JSON_LOG_LEVEL]: LogLevel;
	[CoreBindings.DATA_LIVE_RELOAD_SCRIPT]?: ArrayBuffer;
	[CoreBindings.DURABLE_OBJECT_NAMESPACE_PROXY]: DurableObjectNamespace;
	[CoreBindings.DATA_PROXY_SHARED_SECRET]?: ArrayBuffer;
	[CoreBindings.TRIGGER_HANDLERS]: boolean;
	[CoreBindings.LOG_REQUESTS]: boolean;
	[CoreBindings.STRIP_DISABLE_PRETTY_ERROR]: boolean;
} & {
	[K in `${typeof CoreBindings.SERVICE_USER_ROUTE_PREFIX}${string}`]:
		| Fetcher
		| undefined; // Won't have a `Fetcher` for every possible `string`
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
		if (path.startsWith("/")) path = `./${path.substring(1)}`;
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

function getTargetService(request: Request, url: URL, env: Env) {
	let service: Fetcher | undefined = env[CoreBindings.SERVICE_USER_FALLBACK];

	const override = request.headers.get(CoreHeaders.ROUTE_OVERRIDE);
	request.headers.delete(CoreHeaders.ROUTE_OVERRIDE);

	const route = override ?? matchRoutes(env[CoreBindings.JSON_ROUTES], url);
	if (route !== null) {
		service = env[`${CoreBindings.SERVICE_USER_ROUTE_PREFIX}${route}`];
	}
	return service;
}

function maybePrettifyError(request: Request, response: Response, env: Env) {
	if (
		response.status !== 500 ||
		response.headers.get(CoreHeaders.ERROR_STACK) === null
	) {
		return response;
	}

	return env[CoreBindings.SERVICE_LOOPBACK].fetch(
		"http://localhost/core/error",
		{
			method: "POST",
			headers: request.headers,
			body: response.body,
			cf: { prettyErrorOriginalUrl: request.url },
		}
	);
}

function maybeInjectLiveReload(
	response: Response,
	env: Env,
	ctx: ExecutionContext
) {
	const liveReloadScript = env[CoreBindings.DATA_LIVE_RELOAD_SCRIPT];
	if (
		liveReloadScript === undefined ||
		!response.headers.get("Content-Type")?.toLowerCase().includes("text/html")
	) {
		return response;
	}

	const headers = new Headers(response.headers);
	// Safety of `!`: `parseInt(null)` is `NaN`
	// eslint-disable-next-line @typescript-eslint/no-non-null-assertion
	const contentLength = parseInt(headers.get("content-length")!);
	if (!isNaN(contentLength)) {
		headers.set(
			"content-length",
			String(contentLength + liveReloadScript.byteLength)
		);
	}

	const { readable, writable } = new IdentityTransformStream();
	ctx.waitUntil(
		(async () => {
			await response.body?.pipeTo(writable, { preventClose: true });
			const writer = writable.getWriter();
			await writer.write(liveReloadScript);
			await writer.close();
		})()
	);

	return new Response(readable, {
		status: response.status,
		statusText: response.statusText,
		headers,
	});
}

const acceptEncodingElement =
	/^(?<coding>[a-z]+|\*)(?:\s*;\s*q=(?<weight>\d+(?:.\d+)?))?$/;
interface AcceptedEncoding {
	coding: string;
	weight: number;
}
function maybeParseAcceptEncodingElement(
	element: string
): AcceptedEncoding | undefined {
	const match = acceptEncodingElement.exec(element);
	if (match?.groups == null) return;
	return {
		coding: match.groups.coding,
		weight:
			match.groups.weight === undefined ? 1 : parseFloat(match.groups.weight),
	};
}
function parseAcceptEncoding(header: string): AcceptedEncoding[] {
	const encodings: AcceptedEncoding[] = [];
	for (const element of header.split(",")) {
		const maybeEncoding = maybeParseAcceptEncodingElement(element.trim());
		if (maybeEncoding !== undefined) encodings.push(maybeEncoding);
	}
	// `Array#sort()` is stable, so original ordering preserved for same weights
	return encodings.sort((a, b) => b.weight - a.weight);
}
function ensureAcceptableEncoding(
	clientAcceptEncoding: string | null,
	response: Response
): Response {
	// https://www.rfc-editor.org/rfc/rfc9110#section-12.5.3

	// If the client hasn't specified any acceptable encodings, assume anything is
	if (clientAcceptEncoding === null) return response;
	const encodings = parseAcceptEncoding(clientAcceptEncoding);
	if (encodings.length === 0) return response;

	const contentEncoding = response.headers.get("Content-Encoding");
	const contentType = response.headers.get("Content-Type");

	// if cloudflare's FL does not compress this mime-type, then don't compress locally either
	if (!isCompressedByCloudflareFL(contentType)) {
		return response;
	}

	// If `Content-Encoding` is defined, but unknown, return the response as is
	if (
		contentEncoding !== null &&
		contentEncoding !== "gzip" &&
		contentEncoding !== "br"
	) {
		return response;
	}

	let desiredEncoding: "gzip" | "br" | undefined;
	let identityDisallowed = false;

	for (const encoding of encodings) {
		if (encoding.weight === 0) {
			// If we have an `identity;q=0` or `*;q=0` entry, disallow no encoding
			if (encoding.coding === "identity" || encoding.coding === "*") {
				identityDisallowed = true;
			}
		} else if (encoding.coding === "gzip" || encoding.coding === "br") {
			// If the client accepts one of our supported encodings, use that
			desiredEncoding = encoding.coding;
			break;
		} else if (encoding.coding === "identity") {
			// If the client accepts no encoding, use that
			break;
		}
	}

	if (desiredEncoding === undefined) {
		if (identityDisallowed) {
			return new Response("Unsupported Media Type", {
				status: 415 /* Unsupported Media Type */,
				headers: { "Accept-Encoding": "br, gzip" },
			});
		}
		if (contentEncoding === null) return response;
		response = new Response(response.body, response); // Ensure mutable headers
		response.headers.delete("Content-Encoding"); // Use identity
		return response;
	} else {
		if (contentEncoding === desiredEncoding) return response;
		response = new Response(response.body, response); // Ensure mutable headers
		response.headers.set("Content-Encoding", desiredEncoding); // Use desired
		return response;
	}
}

function colourFromHTTPStatus(status: number): Colorize {
	if (200 <= status && status < 300) return green;
	if (400 <= status && status < 500) return yellow;
	if (500 <= status) return red;
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

	if (env[CoreBindings.JSON_LOG_LEVEL] < LogLevel.INFO) return res;

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

		// The magic proxy client (used by getPlatformProxy) will always specify an operation
		const isProxy = request.headers.get(CoreHeaders.OP) !== null;
		if (isProxy) return handleProxy(request, env);

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
		const service = getTargetService(request, url, env);
		if (service === undefined) {
			return new Response("No entrypoint worker found", { status: 404 });
		}

		try {
			if (env[CoreBindings.SERVICE_LOCAL_EXPLORER]) {
				if (url.pathname.startsWith("/cdn-cgi/explorer/api")) {
					return await env[CoreBindings.SERVICE_LOCAL_EXPLORER].fetch(request);
				} else if (url.pathname.startsWith("/cdn-cgi/explorer")) {
					return new Response("Pretend this is an asset");
					// TODO: serve assets using disk service
				}
			}
			if (env[CoreBindings.TRIGGER_HANDLERS]) {
				if (
					url.pathname === "/cdn-cgi/handler/scheduled" ||
					/* legacy URL path */ url.pathname === "/cdn-cgi/mf/scheduled"
				) {
					if (url.pathname === "/cdn-cgi/mf/scheduled") {
						ctx.waitUntil(
							env[CoreBindings.SERVICE_LOOPBACK].fetch(
								"http://localhost/core/log",
								{
									method: "POST",
									headers: {
										[SharedHeaders.LOG_LEVEL]: LogLevel.WARN.toString(),
									},
									body: `Triggering scheduled handlers via a request to \`/cdn-cgi/mf/scheduled\` is deprecated, and will be removed in a future version of Miniflare. Instead, send a request to \`/cdn-cgi/handler/scheduled\``,
								}
							)
						);
					}
					return await handleScheduled(url.searchParams, service);
				}

				if (url.pathname === "/cdn-cgi/handler/email") {
					return await handleEmail(
						url.searchParams,
						request,
						service,
						env,
						ctx
					);
				}

				if (url.pathname.startsWith("/cdn-cgi/handler/")) {
					return new Response(
						`"${url.pathname}" is not a valid handler. Did you mean to use "/cdn-cgi/handler/scheduled" or "/cdn-cgi/handler/email"?`,
						{ status: 404 }
					);
				}
			}

			let response = await service.fetch(request);
			if (!disablePrettyErrorPage) {
				response = await maybePrettifyError(request, response, env);
			}
			response = maybeInjectLiveReload(response, env, ctx);
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
