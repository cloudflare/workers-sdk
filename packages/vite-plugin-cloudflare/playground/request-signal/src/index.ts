import html from "./index.html?raw";
import { DurableObject } from "cloudflare:workers";

function sleep(ms: number) {
	return new Promise((resolve) => setTimeout(resolve, ms));
}

interface Env {
	STREAMER: DurableObjectNamespace<Streamer>;
}

export class Streamer extends DurableObject {
	#writer?: WritableStreamDefaultWriter<Uint8Array>;
	#aborted = false;

	hasAborted() {
		return this.#aborted;
	}

	abort() {
		this.#writer?.close();
		this.#writer = undefined;
		this.#aborted = true;
	}

	override async fetch() {
		this.#aborted = false;

		const { readable, writable } = new TransformStream();

		const writer = writable.getWriter();
		this.#writer = writer;

		async function stream() {
			const encoder = new TextEncoder();

			for (let i = 0; i < 5; i++) {
				await writer.write(encoder.encode(`Chunk after ${i} seconds`));
				await sleep(1000);
			}
		}

		stream();

		return new Response(readable, {
			headers: { "Content-Type": "text/html; charset=UTF-8" },
		});
	}
}

export default {
	async fetch(request, env) {
		const url = new URL(request.url);

		const id = env.STREAMER.idFromName("id");
		const stub = env.STREAMER.get(id);

		if (url.pathname === "/stream") {
			request.signal.addEventListener("abort", () => {
				console.log("Request aborted by client!");
				stub.abort();
			});

			return stub.fetch(request);
		} else if (url.pathname === "/stream-has-aborted") {
			const hasAborted = await stub.hasAborted();
			return new Response(hasAborted ? "true" : "false");
		}

		return new Response(html, { headers: { "content-type": "text/html" } });
	},
} satisfies ExportedHandler<Env>;
