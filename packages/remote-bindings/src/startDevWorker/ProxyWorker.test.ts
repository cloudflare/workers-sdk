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
		env: {
			PROXY_CONTROLLER: { fetch: typeof fetch };
			PROXY_CONTROLLER_AUTH_SECRET: string;
		}
	) => {
		fetch(request: Request): Response | Promise<Response>;
		requestRetryQueue: Map<Request, unknown>;
	};
};

function startProxy(upstream: typeof fetch) {
	const module = { exports: {} };
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
	const controller = vi
		.fn<typeof fetch>()
		.mockResolvedValue(new Response(null));
	const proxy = new ProxyWorker(
		{},
		{
			PROXY_CONTROLLER: { fetch: controller },
			PROXY_CONTROLLER_AUTH_SECRET: secret,
		}
	);
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
	// Remote previews keep the same host across reloads; only the token changes.
	function play(previewToken: string) {
		return control({
			type: "play",
			proxyData: {
				userWorkerUrl: {
					protocol: "https:",
					hostname: "my-worker.my-subdomain.workers.dev",
					port: "443",
				},
				headers: { "cf-workers-preview-token": previewToken },
			},
		});
	}
	return { proxy, controller, control, play };
}

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
		expect(bundled).toBeDefined();
		const { proxy, control, play } = startProxy(upstream);
		await play("old-preview");
		const request = proxy.fetch(
			new Request("https://binding.example/?MF-Binding=KV")
		);
		await control({ type: "pause" });
		if (phase === "resumed") {
			await play("new-preview");
		}
		pending.reject(new TypeError("Preview connection closed"));
		if (phase === "paused") {
			await vi.waitFor(() => expect(proxy.requestRetryQueue.size).toBe(1));
			await play("new-preview");
		}
		await vi.waitFor(() => expect(upstream).toHaveBeenCalledTimes(2));
		expect(await (await request).text()).toBe("new remote binding");
		expect(proxy.requestRetryQueue.size).toBe(0);
	}
);

it("reports failures from the current preview instead of retrying them", async ({
	expect,
}) => {
	const replacement = new Response("unexpected retry");
	Object.assign(replacement.headers, { getAll: () => [] });
	const upstream = vi
		.fn<typeof fetch>()
		.mockRejectedValueOnce(new TypeError("Preview connection closed"))
		.mockResolvedValue(replacement);
	expect(bundled).toBeDefined();
	const { proxy, controller, play } = startProxy(upstream);
	await play("current-preview");

	await expect(
		proxy.fetch(new Request("https://binding.example/?MF-Binding=KV"))
	).rejects.toThrow("Preview connection closed");
	expect(upstream).toHaveBeenCalledOnce();
	expect(controller).toHaveBeenCalledOnce();
	expect(proxy.requestRetryQueue.size).toBe(0);
});
