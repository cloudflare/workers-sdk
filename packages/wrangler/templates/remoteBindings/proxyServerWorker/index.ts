import { receiveRpcOverHttp } from "@cloudflare/jsrpc";
import { EmailMessage } from "cloudflare:email";

// For most bindings, we expose them as RPC stubs directly to @cloudflare/jsrpc.
// However, SendEmail bindings need to take EmailMessage as their first parameter, which is not serialisable
// As such, we reconstruct it before sending it on to the binding.
// See also packages/miniflare/src/workers/email/email.worker.ts
function getExposedBinding(b: any, searchParams: URLSearchParams) {
	if (b.constructor.name === "SendEmail") {
		return {
			async send(e: ForwardableEmailMessage) {
				// @ts-expect-error EmailMessage::raw is defined in packages/miniflare/src/workers/email/email.worker.ts
				const message = new EmailMessage(e.from, e.to, e["EmailMessage::raw"]);
				return b.send(message);
			},
		};
	}
	if (searchParams.has("MF-Dispatch-Namespace-Options")) {
		const { name, args, options } = JSON.parse(
			searchParams.get("MF-Dispatch-Namespace-Options")!
		);
		return b.get(name, args, options);
	}
	return b;
}
export default {
	async fetch(request, env) {
		if (request.headers.get("Upgrade")) {
			const url = new URL(request.url);
			return receiveRpcOverHttp(
				request,
				getExposedBinding(
					env[url.searchParams.get("MF-Binding")!],
					url.searchParams
				)
			);
		}
		const targetBinding = request.headers.get("MF-Binding");

		if (targetBinding) {
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
			let fetcher = env[targetBinding];

			// Special case the Dispatch Namespace binding because it has a top-level synchronous .get() call
			const dispatchNamespaceOptions = originalHeaders.get(
				"MF-Dispatch-Namespace-Options"
			);
			if (dispatchNamespaceOptions) {
				const { name, args, options } = JSON.parse(dispatchNamespaceOptions);
				fetcher = (env[targetBinding] as DispatchNamespace).get(
					name,
					args,
					options
				);
			}
			return (fetcher as Fetcher).fetch(
				request.headers.get("MF-URL")!,
				new Request(request, {
					redirect: "manual",
					headers: originalHeaders,
				})
			);
		}
		return new Response("Provide a binding", { status: 400 });
	},
} satisfies ExportedHandler<Record<string, Fetcher | DispatchNamespace>>;
