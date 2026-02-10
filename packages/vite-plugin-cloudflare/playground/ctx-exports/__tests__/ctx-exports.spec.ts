import * as path from "node:path";
import { describe, test, vi } from "vitest";
import {
	getTextResponse,
	isBuild,
	mockFileChange,
	serverLogs,
	WAIT_FOR_OPTIONS,
} from "../../__test-utils__";

describe("initial load", () => {
	test("can use `ctx.exports` to access a Worker Entrypoint", async ({
		expect,
	}) => {
		expect(await getTextResponse("/worker-entrypoint")).toBe(
			"Hello World from a Worker Entrypoint"
		);
	});

	test("can use `ctx.exports` to access a Durable Object", async ({
		expect,
	}) => {
		expect(await getTextResponse("/durable-object")).toBe(
			"Hello World from a Durable Object"
		);
	});
});

describe.runIf(!isBuild)("file changes", () => {
	test("does not restart the dev server if the exports have not changed", async ({
		expect,
	}) => {
		mockFileChange(
			path.join(__dirname, "../src/index.ts"),
			() => `
import { DurableObject, WorkerEntrypoint } from "cloudflare:workers";

export class MyWorkerEntrypoint extends WorkerEntrypoint {}

export class MyDurableObject extends DurableObject {}

export default {
	fetch() {
		return new Response("Updated file with the same exports");
	}
}
			`
		);

		await vi.waitFor(async () => {
			const logs = serverLogs.info.join();
			expect(logs).not.toContain(
				"Worker exports have changed. Restarting dev server."
			);
			expect(logs).not.toContain("server restarted");
			expect(await getTextResponse()).toBe(
				"Updated file with the same exports"
			);
		}, WAIT_FOR_OPTIONS);
	});

	test("restarts dev server with updated exports when exports have changed", async ({
		expect,
	}) => {
		mockFileChange(
			path.join(__dirname, "../src/index.ts"),
			() => `
import { DurableObject, WorkerEntrypoint } from "cloudflare:workers";

export class TestWorkerEntrypoint extends WorkerEntrypoint {
	greet() {
		return "Updated file with different exports";
	}
}

export class MyDurableObject extends DurableObject {}

export default {
	async fetch(_, __, ctx) {
		const result = await ctx.exports.TestWorkerEntrypoint.greet();

		return new Response(result);
	}
}
		`
		);

		await vi.waitFor(async () => {
			const logs = serverLogs.info.join();
			expect(logs).toContain(
				"Worker exports have changed. Restarting dev server."
			);
			expect(logs).toContain("server restarted");
			expect(await getTextResponse()).toBe(
				"Updated file with different exports"
			);
		}, WAIT_FOR_OPTIONS);
	});
});
