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
import type { K2Producer, K2ProduceResult, K2Record } from "@cloudflare/config";

/** Adapts K2 producer calls for remote development. */
export default class K2Client extends WorkerEntrypoint<
	RemoteBindingEnv,
	RemoteBindingProps
> {
	async send(
		records: K2Record<ArrayBuffer>[] | K2Record<Uint8Array>[]
	): Promise<K2ProduceResult> {
		const { remoteProxyConnectionString, binding, cfTraceId } = this.ctx.props;
		if (!remoteProxyConnectionString) {
			throwRemoteRequired(binding);
		}

		// Cap'n Web transports Uint8Array but not ArrayBuffer. Convert only
		// all-ArrayBuffer batches; mixed batches fail transport serialization.
		const forwarded =
			Array.isArray(records) &&
			records.every((record) => record?.content instanceof ArrayBuffer)
				? records.map((record) => ({
						...record,
						content: new Uint8Array(record.content as ArrayBuffer),
					}))
				: records;
		const producer = makeRemoteProxyStub(
			remoteProxyConnectionString,
			binding,
			undefined,
			cfTraceId,
			this.env[SharedBindings.MAYBE_SERVICE_LOOPBACK]
		) as unknown as K2Producer & Disposable;
		try {
			const result = await producer.send(forwarded);
			// Return plain data before closing the one-call RPC session. Forwarding
			// its result object can retain remote capabilities/disposer state.
			return result.success
				? { success: true }
				: {
						success: false,
						error: {
							code: result.error.code,
							message: result.error.message,
							retryable: result.error.retryable,
						},
					};
		} finally {
			producer[Symbol.dispose]();
		}
	}
}
