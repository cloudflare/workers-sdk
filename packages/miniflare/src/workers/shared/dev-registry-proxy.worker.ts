import { newWorkersRpcResponse } from "capnweb";
import { WorkerEntrypoint } from "cloudflare:workers";

type WorkerDefinition = {
	origin: string;
	durableObjects: { className: string }[];
	entrypoints: string[];
};

function isJSRPCRequest(request: Request): boolean {
	const url = new URL(request.url);
	return request.headers.has("Upgrade") && url.searchParams.has("MF-Binding");
}

function extractServiceFetchProxyTarget(
	req: Request
): { worker: string; entrypoint: string } | null {
	const url = new URL(req.url).searchParams.get("MF-Binding");

	const binding = req.headers.get("MF-Binding") as string;

	const [target, , entrypoint] = (binding ?? url ?? "").split(":");

	if (target) {
		return { worker: target, entrypoint };
	}
	return null;
}

const HANDLER_RESERVED_KEYS = new Set([
	"alarm",
	"scheduled",
	"self",
	"tail",
	"tailStream",
	"test",
	"trace",
	"webSocketClose",
	"webSocketError",
	"webSocketMessage",
]);

export class NotFoundEntrypoint extends WorkerEntrypoint<
	unknown,
	{ entrypoint: string; worker: string }
> {
	async fetch() {
		const message = `Couldn't find a local dev session for the "${this.ctx.props.entrypoint}" entrypoint of service "${this.ctx.props.worker}" to proxy to`;
		return new Response(message, { status: 503 });
	}

	constructor(ctx: ExecutionContext, env: unknown) {
		super(ctx, env);

		const { entrypoint, worker } = this.ctx.props;

		return new Proxy(this, {
			get(target, prop) {
				if (
					Reflect.has(target, prop) ||
					HANDLER_RESERVED_KEYS.has(String(prop))
				) {
					return Reflect.get(target, prop);
				}
				throw new Error(
					`Cannot access "${String(prop)}" as we couldn't find a local dev session for the "${entrypoint}" entrypoint of service "${worker}" to proxy to.`
				);
			},
		});
	}
}

export default {
	async fetch(request, env, ctx: ExecutionContext) {
		try {
			const target = extractServiceFetchProxyTarget(request);
			if (target) {
				const res = await env.REGISTRY_PATH.fetch(
					`http://placeholder/${target.worker}`
				);
				if (res.status !== 200) {
					if (isJSRPCRequest(request)) {
						return newWorkersRpcResponse(
							request,
							// @ts-expect-error TODO ctx.exports needs a better typing story
							ctx.exports.NotFoundEntrypoint({
								props: { worker: target.worker, entrypoint: target.entrypoint },
							})
						);
					} else {
						return (
							ctx.exports
								// @ts-expect-error TODO ctx.exports needs a better typing story
								.NotFoundEntrypoint({
									props: {
										worker: target.worker,
										entrypoint: target.entrypoint,
									},
								})
								.fetch(request)
						);
					}
				}
				const { origin } = await res.json<WorkerDefinition>();
				const originalURL = new URL(request.url);
				const url = new URL(originalURL.pathname + originalURL.search, origin);
				return fetch(url, request);
			}

			return new Response("Dev Registry target not found", { status: 404 });
		} catch (e) {
			return new Response(
				"Something unexpected went wrong in the dev registry proxy: " + e,
				{ status: 500 }
			);
		}
	},
} satisfies ExportedHandler<{ REGISTRY_PATH: Fetcher }>;
