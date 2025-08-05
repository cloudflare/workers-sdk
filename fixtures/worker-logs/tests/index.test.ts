import { setTimeout } from "node:timers/promises";
import { resolve } from "path";
import { describe, test } from "vitest";
import { runWranglerDev } from "../../shared/src/run-wrangler-long-lived";

async function getWranglerDevOutput(
	type: "module" | "service",
	extraArgs: string[] = [],
	customMessage?: string,
	requests = 1,
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

	const request = new Request(`http://${ip}:${port}`);
	if (customMessage) {
		request.headers.set("x-custom-message", customMessage);
	}

	for (let i = 0; i < requests; i++) {
		const response = await fetch(request);
		await response.text();

		// We wait for a bit for the output stream to be completely ready
		// (this is a bit slow but it's generic to be used by all tests
		// in this file, it also seems to make the tests very stable)
		await setTimeout(500);
	}

	await stop();

	let output = getOutput();

	output = output
		// Windows gets a different marker for ✘, so let's normalize it here
		// so that these tests can be platform independent
		.replaceAll("✘", "X")
		// Let's also normalize Windows newlines
		.replaceAll("\r\n", "\n");

	// Let's filter out lines we're not interested in
	output = output
		.split("\n")
		.filter((line) =>
			logLineToIgnoreRegexps.every((regex) => !regex.test(line))
		)
		// let's also sort the logs for more stability of the tests, ideally
		// we would want to test the log's ordering as well but that seems
		// to cause flakes in the CI runs
		.sort()
		.join("\n");

	return output;
}

describe("'wrangler dev' correctly displays logs", () => {
	describe("module workers", () => {
		test("default behavior", async ({ expect }) => {
			const output = await getWranglerDevOutput("module");
			expect(output).toMatchInlineSnapshot(`
				"[31mX [41;31m[[41;97mERROR[41;31m][0m [1m<<<<<this is an error>>>>>[0m
				[33m▲ [43;33m[[43;30mWARNING[43;33m][0m [1m<<<<<this is a warning>>>>>[0m
				<<<<<this is a log>>>>>
				<<<<<this is an info message>>>>>"
			`);
		});

		test("with --log-level=log", async ({ expect }) => {
			const output = await getWranglerDevOutput("module", ["--log-level=log"]);
			expect(output).toMatchInlineSnapshot(`
				"[31mX [41;31m[[41;97mERROR[41;31m][0m [1m<<<<<this is an error>>>>>[0m
				[33m▲ [43;33m[[43;30mWARNING[43;33m][0m [1m<<<<<this is a warning>>>>>[0m
				<<<<<this is a log>>>>>
				<<<<<this is an info message>>>>>"
			`);
		});

		test("with --log-level=info", async ({ expect }) => {
			const output = await getWranglerDevOutput("module", ["--log-level=info"]);
			expect(output).toMatchInlineSnapshot(`
				"[31mX [41;31m[[41;97mERROR[41;31m][0m [1m<<<<<this is an error>>>>>[0m
				[33m▲ [43;33m[[43;30mWARNING[43;33m][0m [1m<<<<<this is a warning>>>>>[0m
				<<<<<this is an info message>>>>>"
			`);
		});

		test("with --log-level=warn", async ({ expect }) => {
			const output = await getWranglerDevOutput("module", ["--log-level=warn"]);
			expect(output).toMatchInlineSnapshot(`
				"[31mX [41;31m[[41;97mERROR[41;31m][0m [1m<<<<<this is an error>>>>>[0m
				[33m▲ [43;33m[[43;30mWARNING[43;33m][0m [1m<<<<<this is a warning>>>>>[0m"
			`);
		});

		test("with --log-level=error", async ({ expect }) => {
			const output = await getWranglerDevOutput("module", [
				"--log-level=error",
			]);
			expect(output).toMatchInlineSnapshot(
				`"[31mX [41;31m[[41;97mERROR[41;31m][0m [1m<<<<<this is an error>>>>>[0m"`
			);
		});

		test("with --log-level=debug", async ({ expect }) => {
			const output = await getWranglerDevOutput(
				"module",
				["--log-level=debug"],
				undefined,
				// For some reason in debug mode two requests are
				// needed to trigger the log here...
				2
			);
			expect(output).toContain("<<<<<this is a debug message>>>>>");
		});

		test('with WRANGLER_LOG="debug"', async ({ expect }) => {
			const output = await getWranglerDevOutput(
				"module",
				[],
				undefined,
				// For some reason in debug mode two requests are
				// needed to trigger the log here...
				2,
				{ WRANGLER_LOG: "debug" }
			);
			expect(output).toContain("<<<<<this is a debug message>>>>>");
		});

		test("with --log-level=none", async ({ expect }) => {
			const output = await getWranglerDevOutput("module", ["--log-level=none"]);
			expect(output).toMatchInlineSnapshot(`""`);
		});

		// the workerd structured logs follow this structure:
		//   {"timestamp":<number>,"level":"<string>","message":"<string>"}
		// the following tests check for edge case scenario where the following
		// structure could not get detected correctly
		describe("edge case scenarios", () => {
			test("base case", async ({ expect }) => {
				const output = await getWranglerDevOutput("module", [], "hello");
				expect(output).toMatchInlineSnapshot(`"hello"`);
			});
			test("quotes in message", async ({ expect }) => {
				const output = await getWranglerDevOutput("module", [], 'hel"lo');
				expect(output).toMatchInlineSnapshot(`"hel"lo"`);
			});

			test("braces in message", async ({ expect }) => {
				const output = await getWranglerDevOutput("module", [], "hel{}lo");
				expect(output).toMatchInlineSnapshot(`"hel{}lo"`);
			});

			test("a workerd structured message in the message", async ({
				expect,
			}) => {
				const output = await getWranglerDevOutput(
					"module",
					[],
					'This is an example of a Workerd structured log: {"timestamp":1234567890,"level":"log","message":"Hello World!"}'
				);
				expect(output).toMatchInlineSnapshot(
					`"This is an example of a Workerd structured log: {"timestamp":1234567890,"level":"log","message":"Hello World!"}"`
				);
			});

			test("a very very very long message (that gets split in multiple chunks)", async ({
				expect,
			}) => {
				const output = await getWranglerDevOutput(
					"module",
					[],
					"%__VERY_VERY_LONG_MESSAGE_%"
				);
				expect(output).toMatch(new RegExp(`^z{${2 ** 20}}$`));
			});
		});
	});

	// Note: service workers logs are handled differently from standard logs (and are built on top of
	//       inspector Runtime.consoleAPICalled events), they don't work as well as logs for module
	//       workers. Service workers are also deprecated so it's not a huge deal, the following
	//       tests are only here in place to make sure that the basic logging functionality of
	//       service workers does work
	describe("service workers", () => {
		test("default behavior", async ({ expect }) => {
			const output = await getWranglerDevOutput("service");
			expect(output).toMatchInlineSnapshot(`
				"<<<<<this is a log>>>>>
				<<<<<this is a warning>>>>>
				<<<<<this is an error>>>>>
				<<<<<this is an info message>>>>>"
			`);
		});

		test("with --log-level=log", async ({ expect }) => {
			const output = await getWranglerDevOutput("service", ["--log-level=log"]);
			expect(output).toMatchInlineSnapshot(`
				"<<<<<this is a log>>>>>
				<<<<<this is a warning>>>>>
				<<<<<this is an error>>>>>
				<<<<<this is an info message>>>>>"
			`);
		});

		test("with --log-level=info", async ({ expect }) => {
			const output = await getWranglerDevOutput("service", [
				"--log-level=info",
			]);
			expect(output).toMatchInlineSnapshot(`
				"<<<<<this is a warning>>>>>
				<<<<<this is an error>>>>>
				<<<<<this is an info message>>>>>"
			`);
		});

		test("with --log-level=warn", async ({ expect }) => {
			const output = await getWranglerDevOutput("service", [
				"--log-level=warn",
			]);
			expect(output).toMatchInlineSnapshot(`
				"<<<<<this is a warning>>>>>
				<<<<<this is an error>>>>>"
			`);
		});

		test("with --log-level=error", async ({ expect }) => {
			const output = await getWranglerDevOutput("service", [
				"--log-level=error",
			]);
			expect(output).toMatchInlineSnapshot(`"<<<<<this is an error>>>>>"`);
		});

		test("with --log-level=debug", async ({ expect }) => {
			const output = await getWranglerDevOutput("service", [
				"--log-level=debug",
			]);
			expect(output).toContain("<<<<<this is a debug message>>>>>");
		});

		test("with --log-level=none", async ({ expect }) => {
			const output = await getWranglerDevOutput("service", [
				"--log-level=none",
			]);
			expect(output).toMatchInlineSnapshot(`""`);
		});
	});
});

const logLineToIgnoreRegexps = [
	// let's skip empty lines
	/^\s*$/,
	// part of the wrangler banner
	/⛅️ wrangler/,
	// divisor after the wrangler banner
	/^─+$/,
	// wrangler logs such as ` ⎔ Starting local server...`
	/^\s*⎔/,
	// wrangler's ready on log
	/^\[wrangler:info\] Ready on http:\/\/[^:]+:\d+$/,
	// positive response to get request
	/^\[wrangler:info\] GET \/ 200 OK \(\d+ms\)$/,
	// let's skip the telemetry messages
	/^Cloudflare collects anonymous telemetry about your usage of Wrangler\. Learn more at https:\/\/.*$/,
];
