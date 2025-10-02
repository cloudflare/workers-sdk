import { newWorkersRpcResponse } from "capnweb";
import { EmailMessage } from "cloudflare:email";

type Env = Record<string, unknown>;

class BindingNotFoundError extends Error {
	constructor(name?: string) {
		super(`Binding ${name ? `"${name}"` : ""} not found`);
	}
}

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
		throw new BindingNotFoundError();
	}

	const targetBinding = env[bindingName];
	if (!targetBinding) {
		throw new BindingNotFoundError(bindingName);
	}

	if (targetBinding.constructor.name === "SendEmail") {
		return {
			async send(e: ForwardableEmailMessage) {
				// @ts-expect-error EmailMessage::raw is defined in packages/miniflare/src/workers/email/email.worker.ts
				const message = new EmailMessage(e.from, e.to, e["EmailMessage::raw"]);
				return (targetBinding as SendEmail).send(message);
			},
		};
	}

	if (url.searchParams.has("MF-Dispatch-Namespace-Options")) {
		const { name, args, options } = JSON.parse(
			url.searchParams.get("MF-Dispatch-Namespace-Options") as string
		);
		return (targetBinding as DispatchNamespace).get(name, args, options);
	}

	const doID = url.searchParams.get("MF-DO-ID");
	if (doID) {
		const id = (targetBinding as DurableObjectNamespace).idFromString(doID);
		return (targetBinding as DurableObjectNamespace).get(id);
	}

	return targetBinding;
}

function getExposedFetcher(request: Request, env: Env) {
	const bindingName = request.headers.get("MF-Binding");
	if (!bindingName) {
		throw new BindingNotFoundError();
	}

	const targetBinding = env[bindingName];
	if (!targetBinding) {
		throw new BindingNotFoundError(bindingName);
	}

	// Special case the Dispatch Namespace binding because it has a top-level synchronous .get() call
	const dispatchNamespaceOptions = request.headers.get(
		"MF-Dispatch-Namespace-Options"
	);
	if (dispatchNamespaceOptions) {
		const { name, args, options } = JSON.parse(dispatchNamespaceOptions);
		return (targetBinding as DispatchNamespace).get(name, args, options);
	}

	const doID = request.headers.get("MF-DO-ID");
	if (doID) {
		const id = (targetBinding as DurableObjectNamespace).idFromString(doID);
		return (targetBinding as DurableObjectNamespace).get(id);
	}

	return targetBinding as Fetcher;
}

/**
 * This Worker can proxy two types of remote binding:
 *  1. "raw" bindings, where this Worker has been configured to pass through the raw
 *     fetch from a local workerd instance to the relevant binding
 *  2. JSRPC bindings, where this Worker uses capnweb to proxy RPC
 *     communication in userland. This is always over a WebSocket connection
 */
function isJSRPCBinding(request: Request): boolean {
	const url = new URL(request.url);
	return request.headers.has("Upgrade") && url.searchParams.has("MF-Binding");
}

export default {
	async fetch(request, env, ctx) {
		try {
			if (isJSRPCBinding(request)) {
				return newWorkersRpcResponse(
					request,
					getExposedJSRPCBinding(request, env)
				);
			} else {
				const fetcher = getExposedFetcher(request, env);
				const originalHeaders = new Headers();
				for (const [name, value] of request.headers) {
					if (name.startsWith("mf-header-")) {
						originalHeaders.set(name.slice("mf-header-".length), value);
					} else if (name === "upgrade") {
						// The `Upgrade` header needs to be special-cased to prevent:
						//   TypeError: Worker tried to return a WebSocket in a response to a request which did not contain the header "Upgrade: websocket"
						originalHeaders.set(name, value);
					}
				}

				if (request.headers.has("MF-Tail")) {
					// @ts-expect-error This is guaranteed to have a tail method
					await fetcher.tail(
						JSON.parse(await request.text(), tailEventsReviver)
					);
					return new Response("OK");
				}

				const cfHeader = request.headers.get("MF-CF-Blob");

				return fetcher.fetch(
					request.headers.get("MF-URL") ?? "http://example.com",
					new Request(request, {
						redirect: "manual",
						headers: originalHeaders,
						cf: cfHeader ? JSON.parse(cfHeader) : undefined,
					})
				);
			}
		} catch (e) {
			console.log(
				"Something unexpected went wrong in the proxy server" + (e as Error)
			);
			if (e instanceof BindingNotFoundError) {
				return new Response(e.message, { status: 400 });
			}
			return new Response(
				"Something unexpected went wrong in the proxy server" +
					(e as Error).message,
				{ status: 500 }
			);
		}
	},
} satisfies ExportedHandler<Env>;

const serializedDate = "___serialized_date___";

function tailEventsReviver(_: string, value: any) {
	// To restore Date objects from the serialized events
	if (value && typeof value === "object" && serializedDate in value) {
		return new Date(value[serializedDate]);
	}

	return value;
}
