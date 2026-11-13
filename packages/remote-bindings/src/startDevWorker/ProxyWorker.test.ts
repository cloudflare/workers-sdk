import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import { runInNewContext } from "node:vm";
import { buildSync } from "esbuild";
import { it, vi } from "vitest";
import { createDeferred } from "./utils";
import type { ProxyWorkerIncomingRequestBody } from "./events";

const bundled = buildSync({
	entryPoints: [
		fileURLToPath(
			new URL("../../templates/startDevWorker/ProxyWorker.ts", import.meta.url)
		),
	],
	bundle: true,
	platform: "node",
	format: "cjs",
	write: false,
}).outputFiles[0]?.text;

type ProxyModule = {
	ProxyWorker: new (
		state: object,
		env: { PROXY_CONTROLLER_AUTH_SECRET: string }
	) => {
		fetch(request: Request): Response | Promise<Response>;
		requestRetryQueue: Map<Request, unknown>;
	};
};

it.for(["paused", "resumed"])(
	"settles remote-binding requests that fail while the proxy is %s",
	async (phase, { expect }) => {
		const pending = createDeferred<Response>();
		const replacement = new Response("new remote binding");
		Object.assign(replacement.headers, { getAll: () => [] });
		const upstream = vi
			.fn<typeof fetch>()
			.mockReturnValueOnce(pending.promise)
			.mockResolvedValue(replacement);
		const module = { exports: {} };
		expect(bundled).toBeDefined();
		runInNewContext(bundled ?? "", {
			module,
			require: createRequire(import.meta.url),
			exports: module.exports,
			fetch: upstream,
			Request,
			Response: class extends Response {
				constructor(...args: ConstructorParameters<typeof Response>) {
					super(...args);
					Object.assign(this.headers, {
						getAll: () => this.headers.getSetCookie(),
					});
				}
			},
			Headers: class extends Headers {
				override getAll() {
					return this.getSetCookie();
				}
			},
			URL,
		});
		const { ProxyWorker } = module.exports as ProxyModule;
		const secret = "test-controller";
		const proxy = new ProxyWorker({}, { PROXY_CONTROLLER_AUTH_SECRET: secret });
		function control(event: ProxyWorkerIncomingRequestBody) {
			return proxy.fetch(
				Object.assign(
					new Request("https://controller", {
						headers: { Authorization: secret },
					}),
					{ cf: { hostMetadata: event } }
				)
			);
		}
		function play(hostname: string) {
			return control({
				type: "play",
				proxyData: {
					userWorkerUrl: { protocol: "https:", hostname, port: "443" },
					headers: {},
				},
			});
		}
		await play("old-preview.example");
		const request = proxy.fetch(new Request("https://binding.example/read"));
		await control({ type: "pause" });
		if (phase === "resumed") {
			await play("new-preview.example");
		}
		pending.reject(new TypeError("Preview connection closed"));
		if (phase === "paused") {
			await vi.waitFor(() => expect(proxy.requestRetryQueue.size).toBe(1));
			await play("new-preview.example");
		}
		await vi.waitFor(() => expect(upstream).toHaveBeenCalledTimes(2));
		expect(await (await request).text()).toBe("new remote binding");
		expect(proxy.requestRetryQueue.size).toBe(0);
	}
);
