import { Miniflare } from "miniflare";
import { test, vi } from "vitest";
import { singleModuleManifest } from "../../test-shared";
import type { MiniflareOptions } from "miniflare";

const script = "export default { fetch() { return new Response('ok'); } }";

function worker(name: string, connectionString?: string) {
	const config = {
		name,
		compatibilityDate: "2026-09-01",
		manifest: singleModuleManifest(script),
	};
	if (connectionString === undefined) {
		return { config };
	}
	return {
		config: {
			...config,
			env: {
				DB: {
					type: "hyperdrive" as const,
					id: "db",
					dev: { connectionString },
				},
			},
		},
	};
}

function options(targetPort?: number, sslmode = "require"): MiniflareOptions {
	const connectionString =
		targetPort === undefined
			? undefined
			: `postgresql://user:password@127.0.0.1:${targetPort}/db?sslmode=${sslmode}`;
	return { workers: [worker("main", connectionString)] };
}

function listeningServers(): number {
	return process
		.getActiveResourcesInfo()
		.filter((resource) => resource === "TCPServerWrap").length;
}

test("setOptions reuses and retires Hyperdrive proxy listeners", async ({
	expect,
}) => {
	const before = listeningServers();
	const mf = new Miniflare(options(5432));
	try {
		await mf.ready;
		const active = listeningServers();
		expect(active).toBeGreaterThan(before);

		await mf.setOptions(options(5432));
		await vi.waitFor(() => expect(listeningServers()).toBe(active));

		await mf.setOptions(options(5433));
		await vi.waitFor(() => expect(listeningServers()).toBe(active));

		await mf.setOptions(options(5433, "disable"));
		await vi.waitFor(() => expect(listeningServers()).toBe(active - 1));

		await mf.setOptions(options(5434));
		await vi.waitFor(() => expect(listeningServers()).toBe(active));

		await mf.setOptions(options());
		await vi.waitFor(() => expect(listeningServers()).toBe(active - 1));
	} finally {
		await mf.dispose();
	}
	await vi.waitFor(() => expect(listeningServers()).toBe(before));
});

test("failed config assembly closes new proxies and keeps the old listener", async ({
	expect,
}) => {
	const before = listeningServers();
	const mf = new Miniflare(options(5432));
	try {
		await mf.ready;
		const active = listeningServers();
		const changed = `postgresql://user:password@127.0.0.1:5433/db?sslmode=require`;
		await expect(
			mf.setOptions({
				workers: [
					worker("main", changed),
					worker("broken", "mariadb://user:password@localhost/db"),
				],
			})
		).rejects.toThrow();
		await vi.waitFor(() => expect(listeningServers()).toBe(active));
		const response = await mf.dispatchFetch("http://localhost/");
		expect(await response.text()).toBe("ok");
	} finally {
		await mf.dispose();
	}
	await vi.waitFor(() => expect(listeningServers()).toBe(before));
});
