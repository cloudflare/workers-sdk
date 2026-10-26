/**
 * What a test looks like when it composes the three pieces directly, without
 * a `createTestHarness` wrapper.
 */
import * as path from "node:path";
import { afterAll, beforeAll, describe, test } from "vitest";
import {
	connectBindings,
	createExplorerClient,
	createPreviewServer,
} from "../src";
import type { ExplorerClient, PreviewServer } from "../src";
import type { KVNamespace } from "@cloudflare/workers-types/experimental";

const fixtureRoot = path.resolve(__dirname, "../fixture");

type Env = { GREETING: string; NOTES: KVNamespace };

describe("preview server + bindings + Explorer client", () => {
	let server: PreviewServer;
	let explorer: ExplorerClient;

	beforeAll(async () => {
		server = await createPreviewServer({ root: fixtureRoot });
		explorer = createExplorerClient(server.url);
		await explorer
			.worker()
			.d1("DB")
			.applyMigrations({ dir: path.join(fixtureRoot, "migrations") });
	});

	afterAll(async () => {
		await server?.dispose();
	});

	test("fetch, then check KV / D1 / DO state through the Explorer", async ({
		expect,
	}) => {
		const response = await explorer.fetch("/notes", {
			method: "POST",
			body: JSON.stringify({ id: "a", text: "first note" }),
		});
		expect(response.status).toBe(201);
		expect(await response.json()).toEqual({ id: "a", count: 1 });

		const worker = explorer.worker();
		expect(await worker.kv("NOTES").get("note:a")).toBe("first note");
		expect(await worker.d1("DB").query("SELECT * FROM notes")).toEqual([
			{ id: "a", text: "first note" },
		]);
		expect(
			await worker
				.durableObject("COUNTER")
				.sql({ name: "global" }, "SELECT value FROM counter WHERE id = ?", 1)
		).toEqual([{ value: 1 }]);
	});

	test("seed state through bindings, read it through the Worker", async ({
		expect,
	}) => {
		const { env, dispose } = connectBindings<Env>(
			await server.getBindingsConnection()
		);
		expect(env.GREETING).toBe("hello");
		await env.NOTES.put("note:seeded", "from bindings");
		await dispose();

		const response = await explorer.fetch("/notes/seeded");
		expect(await response.text()).toBe("from bindings");
	});

	test("evict a Durable Object: memory resets, storage stays", async ({
		expect,
	}) => {
		const hit = async () => (await explorer.fetch("/counters/evict-me")).json();
		expect(await hit()).toEqual({ memory: 1, count: 1 });
		expect(await hit()).toEqual({ memory: 2, count: 2 });

		// Eviction waits for active references, so drive the object through the
		// Worker here. A stub obtained through `connectBindings()` (or
		// `mf.getBindings()` today) stays alive in workerd until it's garbage
		// collected, even after `dispose()`.
		await explorer
			.worker()
			.durableObject("COUNTER")
			.evict({ name: "evict-me" });

		expect(await hit()).toEqual({ memory: 1, count: 3 });
	});

	test("dispatch a cron and see its side effect and log", async ({
		expect,
	}) => {
		const result = await explorer.worker("notes").scheduled({
			cron: "0 * * * *",
		});
		expect(result.outcome).toBe("ok");
		expect(await explorer.worker().kv("NOTES").get("last-cron")).toBe(
			"0 * * * *"
		);
		expect(server.logs.map((log) => log.message)).toContain(
			"cron fired: 0 * * * *"
		);
	});

	test("re-applying migrations is a no-op", async ({ expect }) => {
		expect(
			await explorer
				.worker()
				.d1("DB")
				.applyMigrations({ dir: path.join(fixtureRoot, "migrations") })
		).toEqual([]);
	});
});
