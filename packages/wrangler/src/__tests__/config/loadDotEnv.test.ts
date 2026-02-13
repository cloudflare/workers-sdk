import { seed } from "@cloudflare/workers-utils/test-helpers";
import { afterEach, beforeEach, describe, it } from "vitest";
import { loadDotEnv } from "../../config/dot-env";
import { logger } from "../../logger";
import { mockConsoleMethods } from "../helpers/mock-console";
import { runInTempDir } from "../helpers/run-in-tmp";

const isWindows = process.platform === "win32";

describe("loadDotEnv()", () => {
	runInTempDir();
	const std = mockConsoleMethods();
	const originalEnv = process.env;

	afterEach(() => {
		process.env = originalEnv;
	});

	beforeEach(() => {
		logger.loggerLevel = "debug";
		return () => logger.resetLoggerLevel();
	});

	it("should load environment variables from .env files", async ({
		expect,
	}) => {
		await seed({
			".env": "FOO=bar\nBAZ=${FOO}\n",
			".env.local": "FOO=qux\n",
		});
		const envPaths = ["./.env", "./.env.local"];
		const result = loadDotEnv(envPaths, {
			includeProcessEnv: false,
			silent: false,
		});

		expect(result).toEqual({ FOO: "qux", BAZ: "qux" });
		expect(std.out).toMatchInlineSnapshot(`
			"Using vars defined in .env
			Using vars defined in .env.local"
		`);
	});

	it("should support silent processing", async ({ expect }) => {
		await seed({
			".env": "FOO=bar\nBAZ=${FOO}\n",
			".env.local": "FOO=qux\n",
		});
		const envPaths = ["./.env", "./.env.local"];
		const result = loadDotEnv(envPaths, {
			includeProcessEnv: false,
			silent: true,
		});

		expect(result).toEqual({ FOO: "qux", BAZ: "qux" });
		expect(std.out).toMatchInlineSnapshot(`""`);
	});

	it("should debug log if .env files are missing", async ({ expect }) => {
		const envPaths = ["./.env.missing"];
		const result = loadDotEnv(envPaths, {
			includeProcessEnv: false,
			silent: false,
		});

		expect(result).toEqual({});
		expect(std.debug).toMatchInlineSnapshot(
			`".env file not found at "./.env.missing". Continuing... For more details, refer to https://developers.cloudflare.com/workers/wrangler/system-environment-variables/"`
		);
	});

	it.skipIf(isWindows)(
		"should have case sensitive env properties",
		async ({ expect }) => {
			await seed({
				".env": "FOO=bar",
			});
			const envPaths = ["./.env"];
			const result = loadDotEnv(envPaths, {
				includeProcessEnv: false,
				silent: true,
			});
			expect(result.FOO).toBe("bar");
			expect(result.foo).toBeUndefined();
		}
	);

	it.skipIf(!isWindows)(
		"should have case insensitive env properties",
		async ({ expect }) => {
			await seed({
				".env": "FOO=bar",
			});
			const envPaths = ["./.env"];
			const result = loadDotEnv(envPaths, {
				includeProcessEnv: false,
				silent: true,
			});
			expect(result.FOO).toBe("bar");
			expect(result.foo).toBe("bar");
		}
	);

	it("should include process.env variables if specified", async ({
		expect,
	}) => {
		process.env = {
			TEST_ENV_VAR: "test_value",
		};
		await seed({
			".env": "FOO=bar",
		});
		const envPaths = ["./.env"];
		const result = loadDotEnv(envPaths, {
			includeProcessEnv: true,
			silent: true,
		});

		expect(result).toEqual({ FOO: "bar", TEST_ENV_VAR: "test_value" });
	});
});
