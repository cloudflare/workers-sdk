import { TransformStream } from "node:stream/web";
import { Response } from "miniflare";
import type {
	HTMLRewriter as BaseHTMLRewriter,
	DocumentHandlers,
	ElementHandlers,
} from "html-rewriter-wasm";
import type { ReadableStream } from "node:stream/web";

// Vendored from Miniflare v2: https://github.com/cloudflare/miniflare/blob/master/packages/html-rewriter/src/rewriter.ts

type SelectorElementHandlers = [selector: string, handlers: ElementHandlers];

export class HTMLRewriter {
	readonly #elementHandlers: SelectorElementHandlers[] = [];
	readonly #documentHandlers: DocumentHandlers[] = [];

	on(selector: string, handlers: ElementHandlers): this {
		this.#elementHandlers.push([selector, handlers]);
		return this;
	}

	onDocument(handlers: DocumentHandlers): this {
		this.#documentHandlers.push(handlers);
		return this;
	}

	transform(response: Response): Response {
		const body = response.body as ReadableStream<Uint8Array> | null;
		// HTMLRewriter doesn't run the end handler if the body is null, so it's
		// pointless to setup the transform stream.
		if (body === null) {
			return new Response(body, response);
		}

		// Make sure we validate chunks are BufferSources and convert them to
		// Uint8Arrays as required by the Rust glue code.
		response = new Response(response.body, response);

		let rewriter: BaseHTMLRewriter;
		const transformStream = new TransformStream<Uint8Array, Uint8Array>({
			start: async (controller) => {
				// Create a rewriter instance for this transformation that writes its
				// output to the transformed response's stream. Note that each
				// BaseHTMLRewriter can only be used once. Importing html-rewriter-wasm
				// will also synchronously compile a WebAssembly module, so delay doing
				// this until we really need it.
				// TODO: async compile the WebAssembly module
				const {
					HTMLRewriter: BaseHTMLRewriter,
					// eslint-disable-next-line @typescript-eslint/consistent-type-imports
				}: typeof import("html-rewriter-wasm") = await import(
					"html-rewriter-wasm"
				);
				rewriter = new BaseHTMLRewriter((output) => {
					// enqueue will throw on empty chunks
					if (output.length !== 0) {
						controller.enqueue(output);
					}
				});
				// Add all registered handlers
				for (const [selector, handlers] of this.#elementHandlers) {
					rewriter.on(selector, handlers);
				}
				for (const handlers of this.#documentHandlers) {
					rewriter.onDocument(handlers);
				}
			},
			// The finally() below will ensure the rewriter is always freed.
			// chunk is guaranteed to be a Uint8Array as we're using the
			// @miniflare/core Response class, which transforms to a byte stream.
			transform: (chunk) => rewriter.write(chunk),
			flush: () => rewriter.end(),
		});
		const promise = body.pipeTo(transformStream.writable);
		promise.catch(() => {}).finally(() => rewriter.free());

		// Return a response with the transformed body, copying over headers, etc
		const res = new Response(transformStream.readable, response);
		// If Content-Length is set, it's probably going to be wrong, since we're
		// rewriting content, so remove it
		res.headers.delete("Content-Length");
		return res;
	}
}
