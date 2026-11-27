import { writeFileSync } from "node:fs";
import path from "node:path";
import { describe, it, vi } from "vitest";
import { readConfig } from "../../src/config/read-config";
import { UserError } from "../../src/errors";
import {
	runInTempDir,
	seed,
	writeWranglerConfig,
} from "../../src/test-helpers";

describe("readConfig()", () => {
	runInTempDir();

	it("normalizes a named environment", ({ expect }) => {
		writeWranglerConfig({
			name: "test-worker",
			compatibility_date: "2026-01-01",
			env: { staging: { vars: { GREETING: "hello" } } },
		});
		const logger = { info: vi.fn(), warn: vi.fn() };
		const config = readConfig({ env: "staging" }, { logger });

		expect(config).toMatchObject({
			name: "test-worker-staging",
			compatibility_date: "2026-01-01",
			configPath: path.resolve("wrangler.toml"),
			vars: { GREETING: "hello" },
		});
		expect(logger.warn).not.toHaveBeenCalled();
	});

	it("reports validation warnings through the injected logger", ({
		expect,
	}) => {
		writeFileSync("wrangler.toml", "unexpected_field = true");
		const logger = { info: vi.fn(), warn: vi.fn() };

		readConfig({}, { logger });

		expect(logger.warn).toHaveBeenCalledExactlyOnceWith(
			expect.stringContaining("unexpected_field")
		);
	});

	it("hides warnings when requested", ({ expect }) => {
		writeFileSync("wrangler.toml", "unexpected_field = true");
		const logger = { info: vi.fn(), warn: vi.fn() };

		readConfig({}, { logger, hideWarnings: true });

		expect(logger.warn).not.toHaveBeenCalled();
	});

	it("lets consumers override warning reporting", ({ expect }) => {
		writeFileSync("wrangler.toml", "unexpected_field = true");
		const logger = { info: vi.fn(), warn: vi.fn() };
		const logWarnings = vi.fn();

		readConfig({}, { logger, logWarnings });

		expect(logWarnings).toHaveBeenCalledOnce();
		expect(logWarnings.mock.calls[0]?.[0].hasWarnings()).toBe(true);
		expect(logger.warn).not.toHaveBeenCalled();
	});

	it("throws a UserError for invalid configuration", ({ expect }) => {
		writeFileSync("wrangler.toml", "name = 42");
		const logger = { info: vi.fn(), warn: vi.fn() };

		expect(() => readConfig({}, { logger })).toThrow(UserError);
	});

	it("reports redirected configurations through the injected logger", async ({
		expect,
	}) => {
		await seed({
			"wrangler.json": JSON.stringify({ name: "original-worker" }),
			".wrangler/deploy/config.json": JSON.stringify({
				configPath: "../../dist/wrangler.json",
			}),
			"dist/wrangler.json": JSON.stringify({ name: "built-worker" }),
		});
		const logger = { info: vi.fn(), warn: vi.fn() };

		const config = readConfig({}, { logger, useRedirectIfAvailable: true });

		expect(config.name).toBe("built-worker");
		expect(logger.info).toHaveBeenCalledExactlyOnceWith(
			expect.stringContaining("Using redirected Wrangler configuration.")
		);
	});
});
