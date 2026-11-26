import { ErrorAuthServerUnreachable } from "@cloudflare/workers-auth";
import { UserError } from "@cloudflare/workers-utils";
import { convertV4MiniflareOptions, Miniflare } from "miniflare";
import { fetch } from "undici";
import { it, vi } from "vitest";
import { startRemoteProxySession } from "./start-remote-proxy-session";
import { createDeferred } from "./startDevWorker/utils";
import type { RemoteBindingsLogger } from "./logger";

it("starts login on the first AI call and keeps unrelated requests available while login is pending or fails", async ({
	expect,
	onTestFinished,
}) => {
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
	const session = await startRemoteProxySession(
		{ AI: { type: "ai" } },
		{ auth, logger, cliDisplayName: "Wrangler" }
	);
	onTestFinished(() => session.dispose());
	const mf = new Miniflare(
		convertV4MiniflareOptions({
			workers: [
				{
					name: "worker",
					compatibilityDate: "2026-01-01",
					modules: true,
					script: `export default { async fetch(request, env) {
						if (new URL(request.url).pathname === "/ai") {
							try { await env.AI.run("@cf/meta/llama-3.1-8b-instruct", { prompt: "Hello" }); }
							catch (error) { return new Response(error.message, { status: 503 }); }
						}
						return new Response("local response");
					} }`,
					ai: {
						binding: "AI",
						remoteProxyConnectionString: session.remoteProxyConnectionString,
					},
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
	await session.updateBindings({ AI: { type: "ai" } });
	expect(auth).not.toHaveBeenCalled();
	const pending = [
		mf.dispatchFetch("http://localhost/ai"),
		mf.dispatchFetch("http://localhost/ai"),
	];
	await vi.waitFor(() => expect(auth).toHaveBeenCalledOnce());
	expect(await (await mf.dispatchFetch("http://localhost/")).text()).toBe(
		"local response"
	);
	login.resolve();
	for (const response of await Promise.all(pending)) {
		expect(response.status).toBe(503);
		expect(await response.text()).toContain("Login cancelled");
	}
	expect(await (await mf.dispatchFetch("http://localhost/")).text()).toBe(
		"local response"
	);
	expect(auth).toHaveBeenCalledOnce();
	// A later binding call can retry without restarting the development server.
	const retried = await mf.dispatchFetch("http://localhost/ai");
	expect(retried.status).toBe(503);
	expect(auth).toHaveBeenCalledTimes(2);
});

it("reports an unreachable OAuth refresh endpoint without marking the failure definitive", async ({
	expect,
	onTestFinished,
}) => {
	const auth = vi.fn(() => {
		throw new ErrorAuthServerUnreachable("OAuth endpoint unavailable", {
			telemetryMessage: "test oauth endpoint unavailable",
		});
	});
	const session = await startRemoteProxySession(
		{ AI: { type: "ai" } },
		{
			lazy: true,
			auth,
			cliDisplayName: "Wrangler",
			logger: {
				loggerLevel: "none",
				debug: vi.fn(),
				log: vi.fn(),
				info: vi.fn(),
				warn: vi.fn(),
				error: vi.fn(),
				console: vi.fn(),
			},
		}
	);
	onTestFinished(() => session.dispose());
	const response = await fetch(session.remoteProxyConnectionString, {
		headers: { "MF-Binding": "AI" },
		signal: AbortSignal.timeout(5_000),
	});
	expect(response.status).toBe(503);
	expect(response.headers.has("mf-remote-session-error")).toBe(false);
	expect(await response.text()).toContain("OAuth endpoint unavailable");
});
