import {
	runInTempDir,
	seed,
	writeWranglerConfig,
} from "@cloudflare/workers-utils/test-helpers";
import { describe, it, vi } from "vitest";
import { mockConsoleMethods } from "../helpers/mock-console";
import { runWrangler } from "../helpers/run-wrangler";
import type { ExpectStatic } from "vitest";

const startDevMock = vi.hoisted(() => vi.fn());

vi.mock("../../dev/start-dev", async () => {
	const { EventEmitter } = await import("node:events");
	return {
		startDev: startDevMock.mockImplementation(async () => {
			const devEnv = new EventEmitter();
			setTimeout(() => devEnv.emit("teardown"), 0);
			return { devEnv, secondary: [], unregisterHotKeys: vi.fn() };
		}),
	};
});

async function expectPagesDevToPassConfigPath(
	expect: ExpectStatic,
	files: Record<string, string> = {}
) {
	await seed({ "public/index.html": "", ...files });
	writeWranglerConfig({ pages_build_output_dir: "public" });
	const exitSpy = vi.spyOn(process, "exit").mockImplementation((() => {
		throw new Error("process.exit");
	}) as typeof process.exit);

	try {
		await expect(runWrangler("pages dev")).rejects.toThrow("process.exit");

		expect(exitSpy).toHaveBeenCalledWith(0);
		expect(startDevMock).toHaveBeenCalledWith(
			expect.objectContaining({
				config: expect.stringMatching(/wrangler\.toml$/),
			})
		);
	} finally {
		exitSpy.mockRestore();
	}
}

/**
 * Given that `runWrangler()` mocks out the underlying implementation
 * (see "vitest.setup.ts") there's only so much worth testing here.
 */
describe("pages dev", () => {
	runInTempDir();
	mockConsoleMethods();

	it("should error if neither [<directory>] nor [--<command>] command line args were specified", async ({
		expect,
	}) => {
		await expect(
			runWrangler("pages dev")
		).rejects.toThrowErrorMatchingInlineSnapshot(
			`[Error: Must specify a directory of static assets to serve, or a command to run, or a proxy port, or configure \`pages_build_output_dir\` in your Wrangler configuration file.]`
		);
	});

	it("should error if both [<directory>] and [--<command>] command line args were specified", async ({
		expect,
	}) => {
		await expect(
			runWrangler("pages dev public -- yarn dev")
		).rejects.toThrowErrorMatchingInlineSnapshot(
			`[Error: Cannot specify both a directory and a proxy command. Provide either a directory of static assets or a proxy command, not both.]`
		);
	});

	it("should error if the [--config] command line arg was specified", async ({
		expect,
	}) => {
		await expect(
			runWrangler("pages dev public --config=/path/to/wrangler.toml")
		).rejects.toThrowErrorMatchingInlineSnapshot(
			`[Error: Pages does not support custom paths for the Wrangler configuration file. Remove the --config flag, or use a standard wrangler.jsonc in your project root.]`
		);
	});

	it("should error if the [--env] command line arg was specified", async ({
		expect,
	}) => {
		await expect(
			runWrangler("pages dev public --env=production")
		).rejects.toThrowErrorMatchingInlineSnapshot(
			`[Error: Pages does not support the --env flag during local development. Use the --branch flag to target your production or preview environment instead.]`
		);
	});

	it("should pass the discovered config path to startDev without package.json", async ({
		expect,
	}) => {
		await expectPagesDevToPassConfigPath(expect);
	});

	it("should pass the discovered config path to startDev with package.json", async ({
		expect,
	}) => {
		await expectPagesDevToPassConfigPath(expect, { "package.json": "{}" });
	});

	it("should not pass a config path to startDev when no config exists", async ({
		expect,
	}) => {
		await seed({ "public/index.html": "" });
		const exitSpy = vi.spyOn(process, "exit").mockImplementation((() => {
			throw new Error("process.exit");
		}) as typeof process.exit);

		try {
			await expect(runWrangler("pages dev public")).rejects.toThrow(
				"process.exit"
			);

			expect(exitSpy).toHaveBeenCalledWith(0);
			expect(startDevMock).toHaveBeenCalledWith(
				expect.objectContaining({ config: undefined })
			);
		} finally {
			exitSpy.mockRestore();
		}
	});
});
