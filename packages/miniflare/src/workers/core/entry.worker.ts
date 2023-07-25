import { unflatten } from "devalue";
import { CoreBindings, CoreHeaders, LogLevel } from "./constants";
import { structuredSerializableRevivers } from "./devalue";
import { WorkerRoute, matchRoutes } from "./routing";

type Env = {
	[CoreBindings.SERVICE_LOOPBACK]: Fetcher;
	[CoreBindings.SERVICE_USER_FALLBACK]: Fetcher;
	[CoreBindings.TEXT_CUSTOM_SERVICE]: string;
	[CoreBindings.TEXT_UPSTREAM_URL]?: string;
	[CoreBindings.JSON_CF_BLOB]: IncomingRequestCfProperties;
	[CoreBindings.JSON_ROUTES]: WorkerRoute[];
	[CoreBindings.JSON_LOG_LEVEL]: LogLevel;
	[CoreBindings.DATA_LIVE_RELOAD_SCRIPT]: ArrayBuffer;
	[CoreBindings.DURABLE_OBJECT_NAMESPACE_PROXY]: DurableObjectNamespace;
} & {
	[K in `${typeof CoreBindings.SERVICE_USER_ROUTE_PREFIX}${string}`]:
		| Fetcher
		| undefined; // Won't have a `Fetcher` for every possible `string`
};

function getUserRequest(
	request: Request<unknown, IncomingRequestCfProperties>,
	env: Env
) {
	const originalUrl = request.headers.get(CoreHeaders.ORIGINAL_URL);
	const upstreamUrl = env[CoreBindings.TEXT_UPSTREAM_URL];
	let url = new URL(originalUrl ?? request.url);
	if (upstreamUrl !== undefined) {
		// If a custom `upstream` was specified, make sure the URL starts with it
		let path = url.pathname + url.search;
		// Remove leading slash, so we resolve relative to `upstream`'s path
		if (path.startsWith("/")) path = path.substring(1);
		url = new URL(path, upstreamUrl);
	}

	request = new Request(url, {
		method: request.method,
		headers: request.headers,
		cf: request.cf ?? env[CoreBindings.JSON_CF_BLOB],
		redirect: request.redirect,
		body: request.body,
	});
	request.headers.delete(CoreHeaders.ORIGINAL_URL);
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

	const accept = request.headers.get("Accept")?.toLowerCase() ?? "";
	const userAgent = request.headers.get("User-Agent")?.toLowerCase() ?? "";
	const acceptsPrettyError =
		!userAgent.includes("curl/") &&
		(accept.includes("text/html") ||
			accept.includes("*/*") ||
			accept.includes("text/*"));
	if (acceptsPrettyError) {
		return env[CoreBindings.SERVICE_LOOPBACK].fetch(
			"http://localhost/core/error",
			{
				method: "POST",
				headers: request.headers,
				body: response.body,
			}
		);
	} else {
		return response;
	}
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

function maybeLogRequest(
	request: Request,
	response: Response,
	env: Env,
	ctx: ExecutionContext,
	startTime: number
) {
	if (env[CoreBindings.JSON_LOG_LEVEL] < LogLevel.INFO) return;

	ctx.waitUntil(
		env[CoreBindings.SERVICE_LOOPBACK].fetch("http://localhost/core/log", {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({
				status: response.status,
				statusText: response.statusText,
				method: request.method,
				url: request.url,
				time: Date.now() - startTime,
			}),
		})
	);
}

function handleProxy(request: Request, env: Env) {
	const ns = env[CoreBindings.DURABLE_OBJECT_NAMESPACE_PROXY];
	// Always use the same singleton Durable Object instance, so we always have
	// access to the same "heap"
	const id = ns.idFromName("");
	const stub = ns.get(id);
	return stub.fetch(request);
}

async function handleQueue(
	request: Request,
	url: URL,
	service: Fetcher,
	startTime: number
) {
	const queueName = decodeURIComponent(url.pathname.substring(1));
	const flattened = await request.json<number | unknown[]>();
	const messages = unflatten(flattened, structuredSerializableRevivers);
	const queueResponse = await service.queue(queueName, messages);
	(queueResponse as FetcherQueueResult & { time: number }).time =
		Date.now() - startTime;
	return Response.json(queueResponse);
}

async function handleScheduled(
	params: URLSearchParams,
	service: Fetcher
): Promise<Response> {
	const time = params.get("time");
	const scheduledTime = time ? new Date(parseInt(time)) : undefined;
	const cron = params.get("cron") ?? undefined;

	const result = await service.scheduled({
		scheduledTime,
		cron,
	});

	return new Response(result.outcome, {
		status: result.outcome === "ok" ? 200 : 500,
	});
}

export default <ExportedHandler<Env>>{
	async fetch(request, env, ctx) {
		const startTime = Date.now();

		// The proxy client will always specify an operation
		const isProxy = request.headers.get(CoreHeaders.OP) !== null;
		if (isProxy) return handleProxy(request, env);

		// `dispatchFetch()` will always inject the passed URL as a header. When
		// calling this function, we never want to display the pretty-error page.
		// Instead, we propagate the error and reject the returned `Promise`.
		const isDispatchFetch =
			request.headers.get(CoreHeaders.ORIGINAL_URL) !== null;

		request = getUserRequest(request, env);
		const url = new URL(request.url);
		const service = getTargetService(request, url, env);
		if (service === undefined) {
			return new Response("No entrypoint worker found", { status: 404 });
		}

		try {
			const customEvent = request.headers.get(CoreHeaders.CUSTOM_EVENT);
			if (customEvent === "queue") {
				return await handleQueue(request, url, service, startTime);
			}

			if (url.pathname === "/cdn-cgi/mf/scheduled") {
				return await handleScheduled(url.searchParams, service);
			}

			let response = await service.fetch(request);
			if (!isDispatchFetch) {
				response = await maybePrettifyError(request, response, env);
			}
			response = maybeInjectLiveReload(response, env, ctx);
			maybeLogRequest(request, response, env, ctx, startTime);
			return response;
		} catch (e: any) {
			return new Response(e?.stack ?? String(e), { status: 500 });
		}
	},
};

export { ProxyServer } from "./proxy.worker";
