import { EmailMessage } from "cloudflare:email";
// The remote-bindings boundary's server logic is shared with Miniflare's storage
// owner. Import the single implementation from Miniflare (a build-time
// dependency; esbuild bundles it into this template) rather than duplicating it.
import {
	BindingError,
	createRemoteBindingsProxyServer,
} from "../../../miniflare/src/workers/shared/remote-bindings-proxy-server";

type Env = Record<string, unknown>;

type SendEmailInput =
	| Parameters<SendEmail["send"]>[0]
	| {
			from: string;
			to: string;
			"EmailMessage::raw": ReadableStream<Uint8Array>;
	  };

/**
 * For most bindings, we expose them as
 *  - RPC stubs directly to capnweb, or
 *  - HTTP based fetchers
 * However, there are some special cases:
 *  - SendEmail bindings need to take EmailMessage as their first parameter,
 *    which is not serialisable. As such, we reconstruct it before sending it
 *    on to the binding. See packages/miniflare/src/workers/email/email.worker.ts
 *  - Dispatch Namespace bindings have a synchronous .get() method. Since we
 *    can't emulate that over an async boundary, we mock it locally and _actually_
 *    perform the .get() remotely at the first appropriate async point. See
 *    packages/miniflare/src/workers/dispatch-namespace/dispatch-namespace.worker.ts
 *
 * getExposedJSRPCBinding() and getExposedFetcher() perform the logic for figuring out
 * which binding is being accessed, dependending on the request. Note: Both have logic
 * for dispatch namespaces, because dispatch namespaces can use both fetch or RPC depending
 * on context.
 */

function getExposedJSRPCBinding(request: Request, env: Env) {
	const url = new URL(request.url);
	const bindingName = url.searchParams.get("MF-Binding");
	if (!bindingName) {
		throw new BindingError("Binding not found");
	}

	const targetBinding = env[bindingName];
	if (!targetBinding) {
		throw new BindingError(`Binding "${bindingName}" not found`);
	}

	if (targetBinding.constructor.name === "SendEmail") {
		return {
			async send(e: SendEmailInput) {
				// Check if this is an EmailMessage (has EmailMessage::raw property) or MessageBuilder
				if ("EmailMessage::raw" in e) {
					// EmailMessage API - reconstruct the EmailMessage object
					const message = new EmailMessage(
						e.from,
						e.to,
						e["EmailMessage::raw"]
					);
					return (targetBinding as SendEmail).send(message);
				} else {
					// MessageBuilder API - pass through directly as a plain object
					return (targetBinding as SendEmail).send(e);
				}
			},
		};
	}

	const dispatchNamespaceOptions = url.searchParams.get(
		"MF-Dispatch-Namespace-Options"
	);
	if (dispatchNamespaceOptions) {
		const { name, args, options } = JSON.parse(dispatchNamespaceOptions);
		return (targetBinding as DispatchNamespace).get(name, args, options);
	}

	return targetBinding;
}

function getExposedFetcher(request: Request, env: Env): Fetcher {
	const bindingName = request.headers.get("MF-Binding");
	if (!bindingName) {
		throw new BindingError("Binding not found");
	}

	const targetBinding = env[bindingName];
	if (!targetBinding) {
		throw new BindingError(`Binding "${bindingName}" not found`);
	}

	// Special case the Dispatch Namespace binding because it has a top-level synchronous .get() call
	const dispatchNamespaceOptions = request.headers.get(
		"MF-Dispatch-Namespace-Options"
	);
	if (dispatchNamespaceOptions) {
		const { name, args, options } = JSON.parse(dispatchNamespaceOptions);
		return (targetBinding as DispatchNamespace).get(name, args, options);
	}
	return targetBinding as Fetcher;
}

export default createRemoteBindingsProxyServer<Env>({
	resolveRpcBinding: getExposedJSRPCBinding,
	resolveFetchBinding: (request, env) => ({
		fetcher: getExposedFetcher(request, env),
	}),
});
