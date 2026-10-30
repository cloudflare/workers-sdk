import { WorkerEntrypoint } from "cloudflare:workers";
import { SharedBindings } from "../shared/constants";
import {
	makeRemoteProxyStub,
	throwRemoteRequired,
} from "../shared/remote-bindings-utils";
import type {
	RemoteBindingEnv,
	RemoteBindingProps,
} from "../shared/remote-bindings-utils";

/** Forwards Analytics Engine writes to the remote dataset. */
export default class AnalyticsEngineClient extends WorkerEntrypoint<
	RemoteBindingEnv,
	RemoteBindingProps
> {
	writeDataPoint(event?: AnalyticsEngineDataPoint): void {
		const { remoteProxyConnectionString, binding, cfTraceId } = this.ctx.props;
		if (!remoteProxyConnectionString) {
			throwRemoteRequired(binding);
		}

		const dataset = makeRemoteProxyStub(
			remoteProxyConnectionString,
			binding,
			undefined,
			cfTraceId,
			this.env[SharedBindings.MAYBE_SERVICE_LOOPBACK]
		) as unknown as AnalyticsEngineDataset & Disposable;

		// Return straight away so the caller's synchronous `writeDataPoint()` never
		// waits on the network, and close the one-call RPC session once written.
		// The caller can't observe failures, so log them here instead.
		this.ctx.waitUntil(
			Promise.resolve(dataset.writeDataPoint(event))
				.catch((error: unknown) => {
					console.error(
						`Failed to write data point to remote Analytics Engine binding "${binding}":`,
						error
					);
				})
				.finally(() => dataset[Symbol.dispose]())
		);
	}
}
