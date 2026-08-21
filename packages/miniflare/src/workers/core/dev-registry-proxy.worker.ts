import { RpcTarget, WorkerEntrypoint } from "cloudflare:workers";
import { getQueueServiceName, HEADER_QUEUE_NAME } from "../queues/constants";
import { getPublicUrl } from "../shared/public-url";
import { CorePaths } from "./constants";
import {
	findQueueConsumer,
	openDebugPortClient,
	resolveSharedStorageOwner,
	resolveTarget,
	tailEventsReplacer,
	tailEventsReviver,
	workerNotFoundMessage,
} from "./dev-registry-proxy-shared.worker";
import type {
	RegistryEntry,
	WorkerdDebugPortConnector,
} from "./dev-registry-proxy-shared.worker";

export {
	createProxyDurableObjectClass,
	setRegistry,
} from "./dev-registry-proxy-shared.worker";

const HANDLER_RESERVED_KEYS = new Set([
	"alarm",
	"connect",
	"self",
	"tail",
	"tailStream",
	"test",
	"trace",
	"webSocketClose",
	"webSocketError",
	"webSocketMessage",
]);

interface Env {
	DEV_REGISTRY_DEBUG_PORT: WorkerdDebugPortConnector;
	DEV_REGISTRY_INSTANCE_ID: string;
	MINIFLARE_LOOPBACK: Fetcher;
}

interface Props {
	service: string;
	entrypoint: string | null;
	// User-supplied `props` from the original service binding / tail consumer.
	// Forwarded to the remote entrypoint via the debug port so they are
	// available as `ctx.props` on the callee.
	userProps?: Record<string, unknown>;
	// Is this trying to access a "storage" miniflare service?
	// If it is, the proxy will try to forward to the shared storage owner
	// (first active worker in the dev registry)
	storage?: boolean;
	storageScope?: string;
}

interface StreamFetcher extends Fetcher {
	upload(
		urlOrBody: string | ReadableStream<Uint8Array>,
		params?: StreamUrlUploadParams
	): Promise<StreamVideo>;
	video(id: string): StreamVideoHandle;
	videos: StreamVideos;
	watermarks: StreamWatermarks;
}

/** Rewrites an owner-generated preview URL to the calling dev session. */
function rewriteStreamVideo(video: StreamVideo, publicUrl: URL): StreamVideo {
	return {
		...video,
		preview: `${publicUrl.origin}${CorePaths.STREAM_VIDEO}/${video.id}/watch`,
	};
}

// An RPC property promise cannot be forwarded transparently through this second
// RPC boundary. Terminate the caller-facing hop with a local RpcTarget, then
// forward its method calls to the target resolved through the debug port.
class ExternalRpcTarget extends RpcTarget {
	constructor(resolve: () => object) {
		super();
		return new Proxy(this, {
			get(target, prop) {
				if (Reflect.has(target, prop)) {
					return Reflect.get(target, prop);
				}
				return Reflect.get(resolve(), prop);
			},
		});
	}
}

class ExternalStreamVideos extends RpcTarget implements StreamVideos {
	constructor(
		private resolve: () => StreamFetcher,
		private resolvePublicUrl: () => Promise<URL>
	) {
		super();
	}

	async list(params?: StreamVideosListParams): Promise<StreamVideo[]> {
		const [videos, publicUrl] = await Promise.all([
			this.resolve().videos.list(params),
			this.resolvePublicUrl(),
		]);
		return videos.map((video) => rewriteStreamVideo(video, publicUrl));
	}
}

class ExternalStreamScopedCaptions
	extends ExternalRpcTarget
	implements StreamScopedCaptions
{
	declare upload: StreamScopedCaptions["upload"];
	declare generate: StreamScopedCaptions["generate"];
	declare list: StreamScopedCaptions["list"];
	declare delete: StreamScopedCaptions["delete"];
}

class ExternalStreamScopedDownloads
	extends ExternalRpcTarget
	implements StreamScopedDownloads
{
	declare generate: StreamScopedDownloads["generate"];
	declare get: StreamScopedDownloads["get"];
	declare delete: StreamScopedDownloads["delete"];
}

class ExternalStreamVideoHandle extends RpcTarget implements StreamVideoHandle {
	readonly id: string;

	constructor(
		private resolve: () => StreamVideoHandle,
		private resolvePublicUrl: () => Promise<URL>,
		id: string
	) {
		super();
		this.id = id;
	}

	async details(): Promise<StreamVideo> {
		const [video, publicUrl] = await Promise.all([
			this.resolve().details(),
			this.resolvePublicUrl(),
		]);
		return rewriteStreamVideo(video, publicUrl);
	}

	async update(params: StreamUpdateVideoParams): Promise<StreamVideo> {
		const [video, publicUrl] = await Promise.all([
			this.resolve().update(params),
			this.resolvePublicUrl(),
		]);
		return rewriteStreamVideo(video, publicUrl);
	}

	delete(): Promise<void> {
		return this.resolve().delete();
	}

	generateToken(): Promise<string> {
		return this.resolve().generateToken();
	}

	get downloads(): StreamScopedDownloads {
		return new ExternalStreamScopedDownloads(() => this.resolve().downloads);
	}

	get captions(): StreamScopedCaptions {
		return new ExternalStreamScopedCaptions(() => this.resolve().captions);
	}
}

class ExternalStreamWatermarks
	extends ExternalRpcTarget
	implements StreamWatermarks
{
	declare generate: StreamWatermarks["generate"];
	declare list: StreamWatermarks["list"];
	declare get: StreamWatermarks["get"];
	declare delete: StreamWatermarks["delete"];
}

function getTarget(props: Props): RegistryEntry | undefined {
	if (props.storage) {
		return props.storageScope === undefined
			? undefined
			: resolveSharedStorageOwner(props.storageScope);
	}
	return resolveTarget(props.service);
}

function resolve(props: Props, env: Env, target: RegistryEntry): Fetcher {
	const { service, entrypoint, userProps, storage } = props;

	const serviceName = storage
		? service
		: entrypoint === null || entrypoint === "default"
			? target.defaultEntrypointService
			: target.userWorkerService;
	const client = openDebugPortClient(
		env.DEV_REGISTRY_DEBUG_PORT,
		target,
		env.DEV_REGISTRY_INSTANCE_ID
	);
	return client.getEntrypoint(serviceName, entrypoint ?? undefined, userProps);
}

/**
 * Relays a queue broker's `/message` or `/batch` request to the dev session
 * consuming that queue. The queue name comes from a request header (rather
 * than binding props) because the broker serves every queue in its process
 * through a single binding. Responds with 503 when no running dev session
 * advertises a consumer for the queue, in which case the sending broker drops
 * the message, mirroring the local no-consumer behaviour.
 */
export class ExternalQueueProxy extends WorkerEntrypoint<Env> {
	fetch(request: Request): Promise<Response> | Response {
		const queueName = request.headers.get(HEADER_QUEUE_NAME);
		if (queueName === null) {
			return new Response(`Missing "${HEADER_QUEUE_NAME}" header`, {
				status: 400,
			});
		}

		const target = findQueueConsumer(queueName);
		if (target === undefined) {
			return new Response(
				`No Worker consuming queue "${queueName}" found in the local dev registry. Make sure the consumer Worker is running locally.`,
				{ status: 503 }
			);
		}

		const client = openDebugPortClient(
			this.env.DEV_REGISTRY_DEBUG_PORT,
			target,
			this.env.DEV_REGISTRY_INSTANCE_ID
		);
		const broker = client.getEntrypoint(getQueueServiceName(queueName));
		const headers = new Headers(request.headers);
		headers.delete(HEADER_QUEUE_NAME);
		return broker.fetch(new Request(request, { headers }));
	}
}

export class ExternalServiceProxy extends WorkerEntrypoint<Env, Props> {
	_fetcher: Fetcher | undefined;
	_targetAddress: string | undefined;
	_targetInstanceId: string | undefined;
	_entryFetcher: Fetcher | null = null;
	_streamVideos = new ExternalStreamVideos(
		() => this._resolveStream(),
		() => this._resolveStreamPublicUrl()
	);
	_streamWatermarks = new ExternalStreamWatermarks(
		() => this._resolveStream().watermarks
	);
	_streamUpload = async (
		urlOrBody: string | ReadableStream<Uint8Array>,
		params?: StreamUrlUploadParams
	): Promise<StreamVideo> => {
		const [video, publicUrl] = await Promise.all([
			this._resolveStream().upload(urlOrBody, params),
			this._resolveStreamPublicUrl(),
		]);
		return rewriteStreamVideo(video, publicUrl);
	};
	_streamVideo = (id: string): StreamVideoHandle =>
		new ExternalStreamVideoHandle(
			() => this._resolveStream().video(id),
			() => this._resolveStreamPublicUrl(),
			id
		);

	constructor(ctx: ExecutionContext<Props>, env: Env) {
		super(ctx, env);

		// Separate connection for scheduled: the debug port's EventDispatcher
		// doesn't support runScheduled/runAlarm/queue, so we forward via HTTP.
		const target = resolveTarget(ctx.props.service);
		if (target && target.debugPortAddress) {
			const client = openDebugPortClient(
				env.DEV_REGISTRY_DEBUG_PORT,
				target,
				env.DEV_REGISTRY_INSTANCE_ID
			);
			this._entryFetcher = client.getEntrypoint("core:entry");
		}

		return new Proxy(this, {
			get(target, prop) {
				const streamStorageProxy =
					ctx.props.storage && ctx.props.service === "stream:service";
				if (streamStorageProxy && prop === "upload") {
					return target._streamUpload;
				}
				if (streamStorageProxy && prop === "video") {
					return target._streamVideo;
				}
				if (streamStorageProxy && prop === "videos") {
					return target._streamVideos;
				}
				if (streamStorageProxy && prop === "watermarks") {
					return target._streamWatermarks;
				}
				if (Reflect.has(target, prop)) {
					return Reflect.get(target, prop);
				}
				if (typeof prop === "string" && HANDLER_RESERVED_KEYS.has(prop)) {
					return undefined;
				}

				const fetcher = target._resolve();
				if (!fetcher) {
					throw new Error(workerNotFoundMessage(ctx.props.service));
				}
				return Reflect.get(fetcher, prop);
			},
		});
	}

	_resolve(): Fetcher | null {
		const target = getTarget(this.ctx.props);
		if (target === undefined || !target.debugPortAddress) {
			this._fetcher = undefined;
			this._targetAddress = undefined;
			this._targetInstanceId = undefined;
			return null;
		}
		if (
			this._fetcher !== undefined &&
			this._targetAddress === target.debugPortAddress &&
			this._targetInstanceId === target.instanceId
		) {
			return this._fetcher;
		}

		this._fetcher = resolve(this.ctx.props, this.env, target);
		this._targetAddress = target.debugPortAddress;
		this._targetInstanceId = target.instanceId;
		return this._fetcher;
	}

	_resolveStream(): StreamFetcher {
		const fetcher = this._resolve() as StreamFetcher | null;
		if (!fetcher) {
			throw new Error(workerNotFoundMessage(this.ctx.props.service));
		}
		return fetcher;
	}

	_resolveStreamPublicUrl(): Promise<URL> {
		return getPublicUrl(this.env.MINIFLARE_LOOPBACK);
	}

	fetch(request: Request): Promise<Response> | Response {
		const fetcher = this._resolve();
		if (!fetcher) {
			return new Response(workerNotFoundMessage(this.ctx.props.service), {
				status: 503,
			});
		}
		return fetcher.fetch(request);
	}

	async scheduled(controller: ScheduledController) {
		if (!this._entryFetcher) {
			throw new Error(workerNotFoundMessage(this.ctx.props.service));
		}
		const params = new URLSearchParams();
		if (controller.cron) {
			params.set("cron", controller.cron);
		}
		if (controller.scheduledTime) {
			params.set("time", String(controller.scheduledTime));
		}
		const response = await this._entryFetcher.fetch(
			new Request(`http://localhost${CorePaths.SCHEDULED}?${params}`, {
				headers: { "MF-Route-Override": this.ctx.props.service },
			})
		);
		if (!response.ok) {
			const body = await response.text();
			throw new Error(
				`Scheduled handler returned HTTP ${response.status}: ${body}`
			);
		}
	}

	// Forward tail events to the remote worker via RPC.
	// Events with rpcMethod==="tail" are filtered out to prevent infinite
	// recursion (the remote tail() call would itself produce a tail event).
	async tail(events: TraceItem[]) {
		const fetcher = this._resolve();
		if (fetcher === null) {
			return;
		}
		const filtered = events.filter(
			(e) => (e.event as { rpcMethod?: string } | null)?.rpcMethod !== "tail"
		);
		if (filtered.length === 0) {
			return;
		}
		try {
			const serializedEvents = JSON.parse(
				JSON.stringify(filtered, tailEventsReplacer),
				tailEventsReviver
			);
			// `await` rather than `return`: the RPC rejects when the peer's debug
			// port has gone away, and returning the promise leaves that rejection
			// outside this `try`, so it escapes as an unhandled rejection instead of
			// being reported.
			// @ts-expect-error .tail is not in the `Fetcher` type but it's a valid RPC call
			await fetcher.tail(serializedEvents);
		} catch (e) {
			console.warn(
				`[dev-registry] Failed to forward tail events to "${
					this.ctx.props.service
				}": ${e instanceof Error ? e.message : String(e)}`
			);
		}
	}
}
