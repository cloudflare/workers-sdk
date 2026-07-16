import { WorkerEntrypoint } from "cloudflare:workers";
import { SharedBindings } from "./constants";
import {
	makeFetch,
	makeRemoteProxyStub,
	pipeSocketOverWebSocket,
	throwRemoteRequired,
} from "./remote-bindings-utils";
import type {
	RemoteBindingEnv,
	RemoteBindingProps,
} from "./remote-bindings-utils";

/** Generic remote proxy client for bindings. */
export default class Client extends WorkerEntrypoint<
	RemoteBindingEnv,
	RemoteBindingProps
> {
	fetch(request: Request): Promise<Response> {
		return makeFetch(
			this.ctx.props.remoteProxyConnectionString,
			this.ctx.props.binding,
			undefined,
			this.ctx.props.cfTraceId,
			this.env[SharedBindings.MAYBE_SERVICE_LOOPBACK]
		)(request);
	}

	// Handles `binding.connect(address)` for raw TCP bindings (e.g. VPC networks).
	// Only reachable when the worker is configured with the `experimental`
	// compatibility flag, which enables inbound `connect` handlers (workerd#6059).
	async connect(socket: Socket): Promise<void> {
		const { remoteProxyConnectionString, binding, cfTraceId } =
			this.ctx.props;
		if (!remoteProxyConnectionString) {
			throwRemoteRequired(binding);
		}

		// The address passed to `binding.connect("host:port")` arrives verbatim as
		// the inbound socket's `localAddress` on the service-binding path. See
		// https://github.com/cloudflare/workerd/pull/6059.
		const { localAddress } = await socket.opened;
		if (!localAddress) {
			throw new Error(
				`Binding ${binding} received a connection without a target address`
			);
		}

		const headers = new Headers({
			Upgrade: "websocket",
			"MF-Binding": binding,
			"MF-Connect-Address": localAddress,
		});
		if (cfTraceId) {
			headers.set("cf-trace-id", cfTraceId);
		}

		const response = await fetch(remoteProxyConnectionString, { headers });
		const ws = response.webSocket;
		if (!ws) {
			throw new Error(
				`Binding ${binding} failed to open a tunnel to ${localAddress} (status ${response.status})`
			);
		}
		ws.accept();

		await pipeSocketOverWebSocket(socket, ws);
	}

	constructor(
		ctx: ExecutionContext<RemoteBindingProps>,
		env: RemoteBindingEnv
	) {
		super(ctx, env);

		const stub = ctx.props.remoteProxyConnectionString
			? makeRemoteProxyStub(
					ctx.props.remoteProxyConnectionString,
					ctx.props.binding,
					undefined,
					ctx.props.cfTraceId,
					env[SharedBindings.MAYBE_SERVICE_LOOPBACK]
				)
			: undefined;

		return new Proxy(this, {
			get: (target, prop) => {
				if (Reflect.has(target, prop)) {
					return Reflect.get(target, prop);
				}
				if (!stub) {
					throwRemoteRequired(ctx.props.binding);
				}
				return Reflect.get(stub, prop);
			},
		});
	}
}
