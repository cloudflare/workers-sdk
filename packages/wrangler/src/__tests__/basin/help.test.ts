import { runInTempDir } from "@cloudflare/workers-utils/test-helpers";
import { describe, it } from "vitest";
import { endEventLoop } from "../helpers/end-event-loop";
import { mockConsoleMethods } from "../helpers/mock-console";
import { runWrangler } from "../helpers/run-wrangler";

describe("basin", () => {
	const std = mockConsoleMethods();
	runInTempDir();

	it("should show Basin products in help", async ({ expect }) => {
		await runWrangler("basin");
		await endEventLoop();

		expect(std.out).toContain("wrangler basin");
		expect(std.out).toContain("Manage Basin products");
		expect(std.out).toContain("wrangler basin sql");
		expect(std.out).toContain("Send queries and manage Basin SQL");
		expect(std.out).toContain("wrangler basin catalog");
		expect(std.out).toContain("Manage Basin Catalog for your R2 buckets");
		expect(std.out).toContain("wrangler basin pipelines");
		expect(std.out).toContain("Manage Cloudflare Pipelines");
	});

	it("should show Basin catalog operations in help", async ({ expect }) => {
		await runWrangler("basin catalog");
		await endEventLoop();

		expect(std.out).toContain("wrangler basin catalog enable <bucket>");
		expect(std.out).toContain("wrangler basin catalog disable <bucket>");
		expect(std.out).toContain("wrangler basin catalog get <bucket>");
		expect(std.out).toContain("wrangler basin catalog compaction");
		expect(std.out).toContain("wrangler basin catalog snapshot-expiration");
	});

	it("should show help through the legacy R2 catalog alias", async ({
		expect,
	}) => {
		await runWrangler("r2 bucket catalog");
		await endEventLoop();

		expect(std.out).toContain("wrangler r2 bucket catalog enable <bucket>");
		expect(std.out).toContain("wrangler r2 bucket catalog disable <bucket>");
		expect(std.out).toContain("wrangler r2 bucket catalog get <bucket>");
	});

	it("should show Basin Pipelines operations in help", async ({ expect }) => {
		await runWrangler("basin pipelines");
		await endEventLoop();

		expect(std.out).toContain("wrangler basin pipelines setup");
		expect(std.out).toContain("wrangler basin pipelines create");
		expect(std.out).toContain("wrangler basin pipelines list");
		expect(std.out).toContain("wrangler basin pipelines streams");
		expect(std.out).toContain("wrangler basin pipelines sinks");
	});

	it("should show help through the legacy Pipelines alias", async ({
		expect,
	}) => {
		await runWrangler("pipelines");
		await endEventLoop();

		expect(std.out).toContain("wrangler pipelines setup");
		expect(std.out).toContain("wrangler pipelines create");
		expect(std.out).toContain("wrangler pipelines streams");
		expect(std.out).toContain("wrangler pipelines sinks");
	});
});
