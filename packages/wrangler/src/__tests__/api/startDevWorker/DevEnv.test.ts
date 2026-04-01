import { describe, test } from "vitest";
import { DevEnv } from "../../../api/startDevWorker/DevEnv";
import { mockConsoleMethods } from "../../helpers/mock-console";

describe("DevEnv", () => {
	const std = mockConsoleMethods();

	describe("handleErrorEvent", () => {
		test("should format esbuild BuildFailure errors nicely for BundlerController", ({
			expect,
		}) => {
			const devEnv = new DevEnv();

			// Create an esbuild-like BuildFailure with errors and warnings arrays
			const buildFailure = Object.assign(new Error("Build failed"), {
				errors: [
					{
						id: "",
						pluginName: "",
						text: 'Could not resolve "some-missing-module"',
						location: null,
						notes: [],
						detail: undefined,
					},
				],
				warnings: [],
			});

			devEnv.dispatch({
				type: "error",
				reason: "Failed to construct initial bundle",
				cause: buildFailure,
				source: "BundlerController",
				data: undefined,
			});

			expect(std.err).toContain("Build failed with 1 error");
			expect(std.err).toContain('Could not resolve "some-missing-module"');

			void devEnv.teardown();
		});

		test("should format esbuild BuildFailure from cause for BundlerController", ({
			expect,
		}) => {
			const devEnv = new DevEnv();

			// Create an esbuild-like BuildFailure nested in cause
			const innerFailure = Object.assign(new Error("Build failed"), {
				errors: [
					{
						id: "",
						pluginName: "",
						text: "Syntax error in worker code",
						location: null,
						notes: [],
						detail: undefined,
					},
				],
				warnings: [],
			});
			const outerError = new Error("Initial build failed.");
			outerError.cause = innerFailure;

			devEnv.dispatch({
				type: "error",
				reason: "Failed to construct initial bundle",
				cause: outerError,
				source: "BundlerController",
				data: undefined,
			});

			expect(std.err).toContain("Build failed with 1 error");
			expect(std.err).toContain("Syntax error in worker code");

			void devEnv.teardown();
		});

		test("should log non-esbuild BundlerController errors with just the message", ({
			expect,
		}) => {
			const devEnv = new DevEnv();

			const buildError = new Error("Custom build command failed");

			devEnv.dispatch({
				type: "error",
				reason: "Custom build failed",
				cause: buildError,
				source: "BundlerController",
				data: { config: undefined, filePath: "src/index.ts" },
			});

			expect(std.err).toContain("Custom build command failed");

			void devEnv.teardown();
		});
	});
});
