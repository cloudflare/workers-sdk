import { runInTempDir, seed } from "@cloudflare/workers-utils/test-helpers";
import { describe, test, vi } from "vitest";
import { loadDotDevDotVars, loadDotEnv } from "../src/dev-vars";
import { getMiniflareWorkerOptions } from "../src/miniflare-options";

function createLogger() {
	return {
		debug: vi.fn(),
		log: vi.fn(),
		info: vi.fn(),
		warn: vi.fn(),
		error: vi.fn(),
	};
}

describe("caller-owned logging", () => {
	runInTempDir();

	test("keeps binding warnings within each caller", async ({ expect }) => {
		await seed({
			"wrangler.jsonc": JSON.stringify({
				name: "test-worker",
				compatibility_date: "2026-11-18",
				vars: { VALUE: 12 },
				secrets: { required: ["TOKEN"] },
			}),
			".dev.vars": "",
		});
		const first = createLogger();
		const second = createLogger();
		const firstResult = getMiniflareWorkerOptions("wrangler.jsonc", undefined, {
			logger: first,
		});
		expect(firstResult.workerOptions.bindings).toMatchObject({ VALUE: 12 });
		expect(
			first.warn.mock.calls.some(([message]) =>
				String(message).includes("Missing required secrets: TOKEN")
			)
		).toBe(true);
		expect(second.warn).not.toHaveBeenCalled();
		const firstWarnings = first.warn.mock.calls.length;

		getMiniflareWorkerOptions("wrangler.jsonc", undefined, { logger: second });
		expect(first.warn).toHaveBeenCalledTimes(firstWarnings);
		expect(
			second.warn.mock.calls.some(([message]) =>
				String(message).includes("Missing required secrets: TOKEN")
			)
		).toBe(true);
	});

	test("uses the supplied logger for dotenv diagnostics", ({ expect }) => {
		const logger = createLogger();
		loadDotEnv([".env.missing"], {
			logger,
			includeProcessEnv: false,
			silent: false,
		});
		expect(logger.debug).toHaveBeenCalledWith(
			expect.stringContaining('.env file not found at ".env.missing"')
		);
	});

	test("warns through the supplied logger for invalid dotenv encoding", async ({
		expect,
	}) => {
		await seed({ ".env": Buffer.from("TOKEN=secret", "utf16le") });
		const logger = createLogger();
		const result = loadDotEnv([".env"], {
			logger,
			includeProcessEnv: false,
			silent: false,
		});
		expect(result).toEqual({});
		expect(logger.warn).toHaveBeenCalledWith(
			expect.stringContaining("not UTF-8 encoded")
		);
	});

	test("uses the caller's deduplicating logger for encoding warnings", async ({
		expect,
	}) => {
		await seed({ ".env": Buffer.from("TOKEN=secret", "utf16le") });
		const logger = { ...createLogger(), once: createLogger() };
		loadDotEnv([".env"], {
			logger,
			includeProcessEnv: false,
			silent: false,
		});
		expect(logger.once.warn).toHaveBeenCalledWith(
			expect.stringContaining("not UTF-8 encoded")
		);
		expect(logger.warn).not.toHaveBeenCalled();
	});

	test("rejects invalid dev vars encoding with the original user error", async ({
		expect,
	}) => {
		await seed({ ".dev.vars": Buffer.from("TOKEN=secret", "utf16le") });
		expect(() =>
			loadDotDevDotVars(".dev.vars", undefined, createLogger())
		).toThrow('The file ".dev.vars" is not UTF-8 encoded');
	});
});
