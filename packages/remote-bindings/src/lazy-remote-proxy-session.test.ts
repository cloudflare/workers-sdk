import assert from "node:assert";
import { UserError } from "@cloudflare/workers-utils";
import { convertV4MiniflareOptions, Miniflare } from "miniflare";
import { it, vi } from "vitest";
import { maybeStartOrUpdateRemoteProxySession } from "./maybe-start-or-update-session";
import { createDeferred } from "./startDevWorker/utils";
import type { RemoteBindingsLogger } from "./logger";
import type { Binding } from "@cloudflare/workers-utils";

it.for(["AI", "KV"] as const)(
	"starts login on the first %s call and keeps unrelated requests available while login is pending or fails",
	async (binding, { expect, onTestFinished }) => {
		const login = createDeferred<void>();
		onTestFinished(() => login.resolve());
		const auth = vi.fn(async () => {
			await login.promise;
			throw new UserError("Login cancelled", {
				telemetryMessage: "test login cancelled",
			});
		});
		const logger: RemoteBindingsLogger = {
			loggerLevel: "none",
			debug: vi.fn(),
			log: vi.fn(),
			info: vi.fn(),
			warn: vi.fn(),
			error: vi.fn(),
			console: vi.fn(),
		};
		const kvId = "0123456789abcdef0123456789abcdef";
		const bindings: Record<string, Binding> =
			binding === "AI"
				? { AI: { type: "ai" } }
				: { KV: { type: "kv_namespace", id: kvId, remote: true } };
		const result = await maybeStartOrUpdateRemoteProxySession(
			{ bindings },
			undefined,
			auth,
			{ logger, cliDisplayName: "Wrangler" }
		);
		assert(result);
		const { session } = result;
		const { remoteProxyConnectionString } = session;
		onTestFinished(() => session.dispose());
		const mf = new Miniflare(
			convertV4MiniflareOptions({
				workers: [
					{
						name: "worker",
						compatibilityDate: "2026-01-01",
						modules: true,
						script: `export default { async fetch(request, env) {
						if (new URL(request.url).pathname === "/remote") {
							try {
								if ("AI" in env) {
									await env.AI.run("@cf/meta/llama-3.1-8b-instruct", { prompt: "Hello" });
								} else {
									await env.KV.get("key");
								}
							} catch (error) { return new Response(error.message, { status: 503 }); }
						}
						return new Response("local response");
					} }`,
						...(binding === "AI"
							? { ai: { binding, remoteProxyConnectionString } }
							: {
									kvNamespaces: {
										KV: { id: kvId, remoteProxyConnectionString },
									},
								}),
					},
				],
			})
		);
		onTestFinished(() => mf.dispose());
		await mf.ready;
		expect(auth).not.toHaveBeenCalled();
		expect(await (await mf.dispatchFetch("http://localhost/")).text()).toBe(
			"local response"
		);
		expect(auth).not.toHaveBeenCalled();
		// Binding-only config updates must also complete without starting a login.
		await session.updateBindings(bindings);
		expect(auth).not.toHaveBeenCalled();
		const pending = [
			mf.dispatchFetch("http://localhost/remote"),
			mf.dispatchFetch("http://localhost/remote"),
		];
		await vi.waitFor(() => expect(auth).toHaveBeenCalledOnce());
		expect(await (await mf.dispatchFetch("http://localhost/")).text()).toBe(
			"local response"
		);
		login.resolve();
		for (const response of await Promise.all(pending)) {
			expect(response.status).toBe(503);
			expect(await response.text()).toContain(
				binding === "AI" ? "Login cancelled" : "KV GET failed: 503"
			);
		}
		expect(logger.warn).toHaveBeenCalledWith(
			expect.stringMatching(
				/Could not connect remote bindings:.*Login cancelled/
			)
		);
		expect(await (await mf.dispatchFetch("http://localhost/")).text()).toBe(
			"local response"
		);
		expect(auth).toHaveBeenCalledOnce();
		// A later binding call can retry without restarting the development server.
		const retried = await mf.dispatchFetch("http://localhost/remote");
		expect(retried.status).toBe(503);
		expect(auth).toHaveBeenCalledTimes(2);
	}
);
