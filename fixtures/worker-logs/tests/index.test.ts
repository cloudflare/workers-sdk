import { stripVTControlCharacters } from "node:util";
import { resolve } from "path";
import { describe, expect, onTestFinished, test, vi } from "vitest";
import { runWranglerDev } from "../../shared/src/run-wrangler-long-lived";

/**
 * Run a Worker, make a request to it, and capture the output logs.
 *
 * You can call the returned function repeatedly to get the currently captured logs.
 * The Worker will be stopped automatically when the test finishes.
 *
 * @param type The type of worker: "module" or "service".
 * @param extraArgs Additional command-line arguments to pass to `wrangler dev`.
 * @param customMessage A custom message to include in the `x-custom-message` header.
 * @param env Environment variables to set for the worker process
 * @returns A function that returns the captured output logs when called
 */
async function getWranglerDevOutput(
	type: "module" | "service",
	extraArgs: string[] = [],
	customMessage?: string,
	env = {}
) {
	const { ip, port, stop, getOutput } = await runWranglerDev(
		resolve(__dirname, ".."),
		[
			`-c=wrangler.${type}.jsonc`,
			"--port=0",
			"--inspector-port=0",
			...extraArgs,
		],
		env
	);

	onTestFinished(() => stop());

	const request = new Request(`http://${ip}:${port}`);
	if (customMessage) {
		request.headers.set("x-custom-message", customMessage);
	}

	const response = await fetch(request);
	await response.text();

	return () => {
		const output = stripVTControlCharacters(getOutput())
			// Windows gets a different marker for ✘, so let's normalize it here
			// so that these tests can be platform independent
			.replaceAll("✘", "X")
			// Let's also normalize Windows newlines
			.replaceAll("\r\n", "\n");

		// Let's filter out lines we're not interested in
		const messages = Array.from(output.matchAll(/^.*<<<<<.*>>>>>$/gm)).flat();
		// Let's also sort the logs for more stability of the tests.
		// Ideally we would want to test the log's ordering as well but that seems
		// to cause flakes in the CI runs
		return messages.sort();
	};
}

describe("'wrangler dev' correctly displays logs", () => {
	describe("module workers", () => {
		test("default behavior", async () => {
			const getOutput = await getWranglerDevOutput("module");
			await vi.waitFor(
				() =>
					expect(getOutput()).toEqual([
						"<<<<< console.debug() message >>>>>",
						"<<<<< console.info() message >>>>>",
						"<<<<< console.log() message >>>>>",
						"<<<<< stderr.write() message >>>>>",
						"<<<<< stdout.write() message >>>>>",
						"X [ERROR] <<<<< console.error() message >>>>>",
						"▲ [WARNING] <<<<< console.warning() message >>>>>",
					]),
				{ timeout: 5000 }
			);
		});

		test("with --log-level=log", async () => {
			const getOutput = await getWranglerDevOutput("module", [
				"--log-level=log",
			]);
			await vi.waitFor(() =>
				expect(getOutput()).toEqual([
					"<<<<< console.debug() message >>>>>",
					"<<<<< console.info() message >>>>>",
					"<<<<< console.log() message >>>>>",
					"<<<<< stderr.write() message >>>>>",
					"<<<<< stdout.write() message >>>>>",
					"X [ERROR] <<<<< console.error() message >>>>>",
					"▲ [WARNING] <<<<< console.warning() message >>>>>",
				])
			);
		});

		test("with --log-level=info", async () => {
			const getOutput = await getWranglerDevOutput("module", [
				"--log-level=info",
			]);
			await vi.waitFor(() =>
				expect(getOutput()).toEqual([
					"<<<<< console.debug() message >>>>>",
					"<<<<< console.info() message >>>>>",
					"X [ERROR] <<<<< console.error() message >>>>>",
					"▲ [WARNING] <<<<< console.warning() message >>>>>",
				])
			);
		});

		test("with --log-level=warn", async () => {
			const getOutput = await getWranglerDevOutput("module", [
				"--log-level=warn",
			]);
			await vi.waitFor(() =>
				expect(getOutput()).toEqual([
					"X [ERROR] <<<<< console.error() message >>>>>",
					"▲ [WARNING] <<<<< console.warning() message >>>>>",
				])
			);
		});

		test("with --log-level=error", async () => {
			const getOutput = await getWranglerDevOutput("module", [
				"--log-level=error",
			]);
			await vi.waitFor(() =>
				expect(getOutput()).toEqual([
					"X [ERROR] <<<<< console.error() message >>>>>",
				])
			);
		});

		test("with --log-level=debug", async () => {
			const getOutput = await getWranglerDevOutput("module", [
				"--log-level=debug",
			]);
			await vi.waitFor(() =>
				expect(getOutput()).toEqual([
					"<<<<< console.debug() message >>>>>",
					"<<<<< console.info() message >>>>>",
					"<<<<< console.log() message >>>>>",
					"<<<<< stderr.write() message >>>>>",
					"<<<<< stdout.write() message >>>>>",
					"X [ERROR] <<<<< console.error() message >>>>>",
					"▲ [WARNING] <<<<< console.warning() message >>>>>",
				])
			);
		});

		test('with WRANGLER_LOG="debug"', async () => {
			const getOutput = await getWranglerDevOutput("module", [], undefined, {
				WRANGLER_LOG: "debug",
			});
			await vi.waitFor(() =>
				expect(getOutput()).toEqual([
					"<<<<< console.debug() message >>>>>",
					"<<<<< console.info() message >>>>>",
					"<<<<< console.log() message >>>>>",
					"<<<<< stderr.write() message >>>>>",
					"<<<<< stdout.write() message >>>>>",
					"X [ERROR] <<<<< console.error() message >>>>>",
					"▲ [WARNING] <<<<< console.warning() message >>>>>",
				])
			);
		});

		test("with --log-level=none", async () => {
			const getOutput = await getWranglerDevOutput("module", [
				"--log-level=none",
			]);
			await vi.waitFor(() => expect(getOutput()).toEqual([]));
		});

		// the workerd structured logs follow this structure:
		//   {"timestamp":<number>,"level":"<string>","message":"<string>"}
		// the following tests check for edge case scenario where the following
		// structure could not get detected correctly
		describe("edge case scenarios", () => {
			test("base case", async () => {
				const getOutput = await getWranglerDevOutput("module", [], "hello");
				await vi.waitFor(() =>
					expect(getOutput()).toEqual(["<<<<< hello >>>>>"])
				);
			});
			test("quotes in message", async () => {
				const getOutput = await getWranglerDevOutput("module", [], 'hel"lo');
				await vi.waitFor(() =>
					expect(getOutput()).toEqual(['<<<<< hel"lo >>>>>'])
				);
			});

			test("braces in message", async () => {
				const getOutput = await getWranglerDevOutput("module", [], "hel{}lo");
				await vi.waitFor(() =>
					expect(getOutput()).toEqual(["<<<<< hel{}lo >>>>>"])
				);
			});

			test("a workerd structured message in the message", async () => {
				const getOutput = await getWranglerDevOutput(
					"module",
					[],
					'This is an example of a Workerd structured log: {"timestamp":1234567890,"level":"log","message":"Hello World!"}'
				);
				await vi.waitFor(() =>
					expect(getOutput()).toEqual([
						'<<<<< This is an example of a Workerd structured log: {"timestamp":1234567890,"level":"log","message":"Hello World!"} >>>>>',
					])
				);
			});

			test("a very very very long message (that gets split in multiple chunks)", async () => {
				const getOutput = await getWranglerDevOutput(
					"module",
					[],
					"%__VERY_VERY_LONG_MESSAGE_%"
				);
				await vi.waitFor(() =>
					expect(getOutput()).toContain(
						"<<<<< " + "z".repeat(2 ** 20) + " >>>>>"
					)
				);
			});
		});
	});

	// Note: service workers logs are handled differently from standard logs (and are built on top of
	//       inspector Runtime.consoleAPICalled events), they don't work as well as logs for module
	//       workers. Service workers are also deprecated so it's not a huge deal, the following
	//       tests are only here in place to make sure that the basic logging functionality of
	//       service workers does work
	describe("service workers", () => {
		test("default behavior", async () => {
			const getOutput = await getWranglerDevOutput("service");
			await vi.waitFor(() =>
				expect(getOutput()).toEqual([
					"<<<<< console.error() message >>>>>",
					"<<<<< console.info() message >>>>>",
					"<<<<< console.log() message >>>>>",
					"<<<<< console.warning() message >>>>>",
				])
			);
		});

		test("with --log-level=log", async () => {
			const getOutput = await getWranglerDevOutput("service", [
				"--log-level=log",
			]);
			await vi.waitFor(() =>
				expect(getOutput()).toEqual([
					"<<<<< console.error() message >>>>>",
					"<<<<< console.info() message >>>>>",
					"<<<<< console.log() message >>>>>",
					"<<<<< console.warning() message >>>>>",
				])
			);
		});

		test("with --log-level=info", async () => {
			const getOutput = await getWranglerDevOutput("service", [
				"--log-level=info",
			]);
			await vi.waitFor(() =>
				expect(getOutput()).toEqual([
					"<<<<< console.error() message >>>>>",
					"<<<<< console.info() message >>>>>",
					"<<<<< console.warning() message >>>>>",
				])
			);
		});

		test("with --log-level=warn", async () => {
			const getOutput = await getWranglerDevOutput("service", [
				"--log-level=warn",
			]);
			await vi.waitFor(() =>
				expect(getOutput()).toEqual([
					"<<<<< console.error() message >>>>>",
					"<<<<< console.warning() message >>>>>",
				])
			);
		});

		test("with --log-level=error", async () => {
			const getOutput = await getWranglerDevOutput("service", [
				"--log-level=error",
			]);
			await vi.waitFor(() =>
				expect(getOutput()).toEqual(["<<<<< console.error() message >>>>>"])
			);
		});

		test("with --log-level=debug", async () => {
			const getOutput = await getWranglerDevOutput("service", [
				"--log-level=debug",
			]);
			await vi.waitFor(() =>
				expect(getOutput()).toEqual([
					"<<<<< console.debug() message >>>>>",
					"<<<<< console.error() message >>>>>",
					"<<<<< console.info() message >>>>>",
					"<<<<< console.log() message >>>>>",
					"<<<<< console.warning() message >>>>>",
				])
			);
		});

		test("with --log-level=none", async () => {
			const getOutput = await getWranglerDevOutput("service", [
				"--log-level=none",
			]);
			await vi.waitFor(() => expect(getOutput()).toEqual([]));
		});
	});

	describe("nodejs compat process v2", () => {
		test("default behavior", async () => {
			const getOutput = await getWranglerDevOutput("module", [
				"--compatibility-flags=enable_nodejs_process_v2",
				"--compatibility-flags=nodejs_compat",
			]);
			await vi.waitFor(() =>
				expect(getOutput()).toEqual([
					"<<<<< console.debug() message >>>>>",
					"<<<<< console.info() message >>>>>",
					"<<<<< console.log() message >>>>>",
					"X [ERROR] <<<<< console.error() message >>>>>",
					"stderr: <<<<< stderr.write() message >>>>>",
					"stdout: <<<<< stdout.write() message >>>>>",
					"▲ [WARNING] <<<<< console.warning() message >>>>>",
				])
			);
		});
	});
});
