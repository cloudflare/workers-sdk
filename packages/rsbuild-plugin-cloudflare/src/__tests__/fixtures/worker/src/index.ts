import { Buffer } from "node:buffer";
import { env } from "cloudflare:workers";

interface Env {
	KV: KVNamespace;
	GREETING: string;
	SECRET: string;
}

export default {
	async fetch(request, workerEnv) {
		const { pathname } = new URL(request.url);

		switch (pathname) {
			case "/kv": {
				await workerEnv.KV.put("key", "value");
				return new Response(await workerEnv.KV.get("key"));
			}
			case "/node": {
				return new Response(Buffer.from("aGVsbG8=", "base64").toString());
			}
			case "/process": {
				return new Response(typeof process.env);
			}
			case "/dynamic-import": {
				const { message } = await import("./lazy");
				return new Response(message);
			}
			case "/secret": {
				return new Response(workerEnv.SECRET);
			}
		}

		return new Response(`${(env as Env).GREETING} from rsbuild + workerd`);
	},
} satisfies ExportedHandler<Env>;
