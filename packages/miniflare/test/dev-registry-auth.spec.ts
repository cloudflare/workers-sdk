import assert from "node:assert";
import http from "node:http";
import { getWorkerRegistry } from "miniflare";
import { describe } from "vitest";
import { CoreHeaders } from "../src/workers/core/constants";
import { disposeWithRetry } from "./test-shared";
import { test } from "./test-shared/control-plane-auth";

describe.sequential("dev-registry authentication", () => {
	test("rejects registry replacement before parsing and preserves shared storage", async ({
		expect,
		start,
	}) => {
		const { mf, info, registryPath } = await start();
		const kv = await mf.getKVNamespace("KV");
		await kv.put("canary", "original");
		for (const credential of [undefined, "unknown", "x".repeat(64)]) {
			const headers: Record<string, string> = {};
			if (credential !== undefined) {
				headers[CoreHeaders.DEV_REGISTRY_SECRET] = credential;
			}
			const response = await fetch(info.registryUrl, {
				method: "POST",
				headers,
				body: "not JSON",
			});
			expect(response.status).toBe(403);
			await response.text();
		}
		expect(await kv.get("canary")).toBe("original");
		const registry = getWorkerRegistry(registryPath);
		const owner = Object.values(registry).find((entry) => entry.storageScope);
		assert(owner);
		const forged = await fetch(info.registryUrl, {
			method: "POST",
			body: JSON.stringify({
				attacker: { ...owner, created: 0, debugPortAddress: "127.0.0.1:9" },
			}),
		});
		expect(forged.status).toBe(403);
		await forged.text();
		expect(await kv.get("canary")).toBe("original");
		const snapshot = JSON.stringify(registry);
		for (const [url, extra] of [
			[`${info.registryUrl}/unexpected`, {}],
			[info.registryUrl, { Origin: "http://localhost" }],
		] as const) {
			const response = await fetch(url, {
				method: "POST",
				headers: {
					[CoreHeaders.DEV_REGISTRY_SECRET]: info.registrySecret,
					...extra,
				},
				body: snapshot,
			});
			expect(response.status).toBe(403);
			await response.text();
		}
		// Node fetch rewrites Host; use the HTTP client to preserve a forged one.
		const forgedHostStatus = await new Promise<number>((resolve, reject) => {
			const request = http.request(
				info.registryUrl,
				{
					method: "POST",
					headers: {
						Host: "attacker.example",
						[CoreHeaders.DEV_REGISTRY_SECRET]: info.registrySecret,
					},
				},
				(response) => {
					response.resume();
					resolve(response.statusCode ?? 0);
				}
			);
			request.on("error", reject);
			request.end(snapshot);
		});
		expect(forgedHostStatus).toBe(403);
		const authorized = await fetch(info.registryUrl, {
			method: "POST",
			headers: { [CoreHeaders.DEV_REGISTRY_SECRET]: info.registrySecret },
			body: snapshot,
		});
		expect(authorized.status).toBe(200);
		await authorized.text();
		expect(await kv.get("canary")).toBe("original");
	});

	test("rejects a registry credential from a disposed runtime", async ({
		expect,
		start,
	}) => {
		const first = await start();
		const second = await start();
		expect(first.info.registrySecret).not.toBe(second.info.registrySecret);
		await disposeWithRetry(first.mf);
		const response = await fetch(second.info.registryUrl, {
			method: "POST",
			headers: { [CoreHeaders.DEV_REGISTRY_SECRET]: first.info.registrySecret },
			body: "{}",
		});
		expect(response.status).toBe(403);
		await response.text();
	});
});
