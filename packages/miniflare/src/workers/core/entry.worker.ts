// @ts-expect-error "devalue" is ESM-only, so TypeScript requires us to use the
//  `*.mts` extension, or set `"type": "module"` in our `package.json`. We can't
//  do the first as ambient types from `@cloudflare/workers-types` don't seem to
//  work, and the second would affect all consumers of `miniflare`.
import { unflatten } from "devalue";
import { CoreBindings, CoreHeaders, LogLevel } from "./constants";
import { structuredSerializableRevivers } from "./devalue";
import { WorkerRoute, matchRoutes } from "./routing";

type Env = {
	[CoreBindings.SERVICE_LOOPBACK]: Fetcher;
	[CoreBindings.JSON_VERSION]: number;
	[CoreBindings.SERVICE_USER_FALLBACK]: Fetcher;
	[CoreBindings.TEXT_CUSTOM_SERVICE]: string;
	[CoreBindings.JSON_CF_BLOB]: IncomingRequestCfProperties;
	[CoreBindings.JSON_ROUTES]: WorkerRoute[];
	[CoreBindings.JSON_LOG_LEVEL]: LogLevel;
	[CoreBindings.DATA_LIVE_RELOAD_SCRIPT]: ArrayBuffer;
} & {
	[K in `${typeof CoreBindings.SERVICE_USER_ROUTE_PREFIX}${string}`]:
		| Fetcher
		| undefined; // Won't have a `Fetcher` for every possible `string`
};

function maybeCreateProbeResponse(request: Request, env: Env) {
	const probe = request.headers.get(CoreHeaders.PROBE);
	if (probe === null) return;

	const probeMin = parseInt(probe);
	// Using `>=` for version check to handle multiple `setOptions` calls
	// before reload complete.
	const status = env[CoreBindings.JSON_VERSION] >= probeMin ? 204 : 412;
	return new Response(null, { status });
}

function getUserRequest(
	request: Request<unknown, IncomingRequestCfProperties>,
	env: Env
) {
	const originalUrl = request.headers.get(CoreHeaders.ORIGINAL_URL);
	request = new Request(originalUrl ?? request.url, {
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
	(queueResponse as QueueResponse & { time: number }).time =
		Date.now() - startTime;
	return Response.json(queueResponse);
}

export default <ExportedHandler<Env>>{
	async fetch(request, env, ctx) {
		const startTime = Date.now();

		const maybeProbeResponse = maybeCreateProbeResponse(request, env);
		if (maybeProbeResponse !== undefined) return maybeProbeResponse;

		request = getUserRequest(request, env);

		const url = new URL(request.url);
		const service = getTargetService(request, url, env);
		if (service === undefined) {
			return new Response("No entrypoint worker found", { status: 404 });
		}

		try {
			const customEvent = request.headers.get(CoreHeaders.CUSTOM_EVENT);
			// TODO(soon): support scheduled events, requires support from workerd
			if (customEvent === "queue") {
				return await handleQueue(request, url, service, startTime);
			}

			let response = await service.fetch(request);
			response = await maybePrettifyError(request, response, env);
			response = maybeInjectLiveReload(response, env, ctx);
			maybeLogRequest(request, response, env, ctx, startTime);
			return response;
		} catch (e: any) {
			return new Response(e?.stack ?? String(e), { status: 500 });
		}
	},
};
