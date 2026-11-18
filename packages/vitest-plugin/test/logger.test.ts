import {
	mockConsoleMethods,
	runInTempDir,
	seed,
} from "@cloudflare/workers-utils/test-helpers";
import { Log, LogLevel } from "miniflare";
import { describe, it } from "vitest";
import { parseProjectOptions } from "../src/pool/config";
import { createSharedLogger } from "../src/pool/logger";
import type { TestProject } from "vitest/node";

describe("shared helper logging", () => {
	runInTempDir();
	const std = mockConsoleMethods();

	it("preserves the pool logger's level and message formatting", ({
		expect,
	}) => {
		const logger = createSharedLogger(
			new Log(LogLevel.ERROR, { prefix: "vpw" })
		);
		logger.debug("hidden debug");
		logger.log("hidden log");
		logger.info("hidden info");
		logger.warn("hidden warning");
		logger.error("error %s", "details");

		expect(std.out).toBe("[vpw:error] error details");
		expect(std.err).toBe("");
		expect(std.warn).toBe("");
	});

	it("deduplicates helper warnings across project configurations", async ({
		expect,
	}) => {
		await seed({
			"wrangler.json": JSON.stringify({
				name: "test-worker",
				compatibility_date: "2025-12-02",
				hyperdrive: [
					{
						binding: "DB",
						id: "00000000000000000000000000000000",
						remote: true,
						localConnectionString:
							"postgres://user:password@localhost:5432/database",
					},
				],
			}),
		});
		const project = {
			name: "test",
			config: { root: process.cwd() },
			vite: { config: { mode: "test", envDir: process.cwd() } },
		} as unknown as TestProject;
		const options = {
			wrangler: { configPath: "wrangler.json" },
			remoteBindings: false,
		};

		await parseProjectOptions(project, options);
		await parseProjectOptions(
			{ ...project, name: "second" } as TestProject,
			options
		);

		expect(std.out).toBe(
			'[vpw:warn] The Hyperdrive binding "DB" is configured with "remote": true, but no remote connection could be established. Falling back to its "localConnectionString".'
		);
		expect(std.warn).toBe("");
	});
});
