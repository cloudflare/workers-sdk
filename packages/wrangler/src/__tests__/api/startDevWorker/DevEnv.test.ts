// eslint-disable-next-line no-restricted-imports
import { describe, expect, test } from "vitest";
import { DevEnv } from "../../../api/startDevWorker/DevEnv";
import { mockConsoleMethods } from "../../helpers/mock-console";

describe("DevEnv", () => {
	const std = mockConsoleMethods();

	describe("handleErrorEvent", () => {
		test("should log BundlerController errors at error level", () => {
			const devEnv = new DevEnv();

			const buildError = new Error("Could not resolve module 'foo'");

			devEnv.dispatch({
				type: "error",
				reason: "Failed to construct initial bundle",
				cause: buildError,
				source: "BundlerController",
				data: undefined,
			});

			expect(std.err).toContain("Failed to construct initial bundle");
			expect(std.err).toContain("Could not resolve module 'foo'");

			void devEnv.teardown();
		});

		test("should log custom build errors at error level", () => {
			const devEnv = new DevEnv();

			const buildError = new Error("Custom build command failed");

			devEnv.dispatch({
				type: "error",
				reason: "Custom build failed",
				cause: buildError,
				source: "BundlerController",
				data: { config: undefined, filePath: "src/index.ts" },
			});

			expect(std.err).toContain("Custom build failed");
			expect(std.err).toContain("Custom build command failed");

			void devEnv.teardown();
		});
	});
});
