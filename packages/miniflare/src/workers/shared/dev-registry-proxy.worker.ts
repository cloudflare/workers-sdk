import { newWorkersRpcResponse } from "capnweb";
import { WorkerEntrypoint } from "cloudflare:workers";

function isJSRPCRequest(request: Request): boolean {
	const url = new URL(request.url);
	return request.headers.has("Upgrade") && url.searchParams.has("MF-Binding");
}

function extractServiceFetchProxyTarget(
	req: Request
): { worker: string; entrypoint: string } | null {
	const url = new URL(req.url).searchParams.get("MF-Binding");

	const binding = req.headers.get("MF-Binding") as string;

	const [target, _, entrypoint] = (binding ?? url ?? "").split(":");

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
		const target = extractServiceFetchProxyTarget(request);
		if (target) {
			const res = await env.REGISTRY_PATH.fetch(
				`http://placeholder/${target.worker}`
			);
			if (res.status !== 200) {
				if (isJSRPCRequest(request)) {
					return newWorkersRpcResponse(
						request,
						// @ts-ignore
						ctx.exports.NotFoundEntrypoint({
							props: { worker: target.worker, entrypoint: target.entrypoint },
						})
					);
				} else {
					return (
						ctx.exports
							// @ts-ignore
							.NotFoundEntrypoint({
								props: { worker: target.worker, entrypoint: target.entrypoint },
							})
							.fetch(request)
					);
				}
			}
			const { host, port } = await res.json<{ host: string; port: number }>();
			const url = new URL(request.url);
			url.hostname = host;
			url.port = String(port);
			return fetch(url, request);
		}

		return new Response("Dev Registry target not found", { status: 404 });
	},
} satisfies ExportedHandler<{ REGISTRY_PATH: Fetcher }>;
