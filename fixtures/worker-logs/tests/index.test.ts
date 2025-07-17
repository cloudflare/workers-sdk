import { setTimeout } from "node:timers/promises";
import { resolve } from "path";
import { describe, test } from "vitest";
import { runWranglerDev } from "../../shared/src/run-wrangler-long-lived";

async function getWranglerDevOutput(
	type: "module" | "service",
	extraArgs: string[] = []
) {
	const { ip, port, stop, getOutput } = await runWranglerDev(
		resolve(__dirname, ".."),
		[
			`-c=wrangler.${type}.jsonc`,
			"--port=0",
			"--inspector-port=0",
			...extraArgs,
		]
	);

	const response = await fetch(`http://${ip}:${port}`);
	await response.text();

	// We wait for a bit for the output stream to be completely ready
	// (this is a bit slow but it's generic to be used by all tests
	// in this file, it also seems to make the tests very stable)
	await setTimeout(1_000);

	await stop();

	let output = getOutput();

	// Windows gets a different marker for ✘, so let's normalize it here
	// so that these tests can be platform independent
	output = output.replaceAll("✘", "X");

	// Let's filter out lines we're not interested in
	output = output
		.split("\n")
		.filter((line) =>
			logLineToIgnoreRegexps.every((regex) => !regex.test(line))
		)
		.join("\n");

	return output;
}

describe("'wrangler dev' correctly displays logs", () => {
	describe("module workers", () => {
		test("default behavior", async ({ expect }) => {
			const output = await getWranglerDevOutput("module");
			expect(output).toMatchInlineSnapshot(`
				"
				<<<<<this is a log>>>>>
				[33m▲ [43;33m[[43;30mWARNING[43;33m][0m [1m<<<<<this is a warning>>>>>[0m


				[31mX [41;31m[[41;97mERROR[41;31m][0m [1m<<<<<this is an error>>>>>[0m


				<<<<<this is an info message>>>>>
				"
			`);
		});

		test("with --log-level=log", async ({ expect }) => {
			const output = await getWranglerDevOutput("module", ["--log-level=log"]);
			expect(output).toMatchInlineSnapshot(`
				"
				<<<<<this is a log>>>>>
				[33m▲ [43;33m[[43;30mWARNING[43;33m][0m [1m<<<<<this is a warning>>>>>[0m


				[31mX [41;31m[[41;97mERROR[41;31m][0m [1m<<<<<this is an error>>>>>[0m


				<<<<<this is an info message>>>>>
				"
			`);
		});

		test("with --log-level=info", async ({ expect }) => {
			const output = await getWranglerDevOutput("module", ["--log-level=info"]);
			expect(output).toMatchInlineSnapshot(`
				"[33m▲ [43;33m[[43;30mWARNING[43;33m][0m [1m<<<<<this is a warning>>>>>[0m


				[31mX [41;31m[[41;97mERROR[41;31m][0m [1m<<<<<this is an error>>>>>[0m


				<<<<<this is an info message>>>>>
				"
			`);
		});

		test("with --log-level=warn", async ({ expect }) => {
			const output = await getWranglerDevOutput("module", ["--log-level=warn"]);
			expect(output).toMatchInlineSnapshot(`
				"[33m▲ [43;33m[[43;30mWARNING[43;33m][0m [1m<<<<<this is a warning>>>>>[0m


				[31mX [41;31m[[41;97mERROR[41;31m][0m [1m<<<<<this is an error>>>>>[0m


				"
			`);
		});

		test("with --log-level=error", async ({ expect }) => {
			const output = await getWranglerDevOutput("module", [
				"--log-level=error",
			]);
			expect(output).toMatchInlineSnapshot(`
				"[31mX [41;31m[[41;97mERROR[41;31m][0m [1m<<<<<this is an error>>>>>[0m


				"
			`);
		});

		test("with --log-level=debug", async ({ expect }) => {
			const output = await getWranglerDevOutput("module", [
				"--log-level=debug",
			]);
			expect(output).toContain("<<<<<this is a debug message>>>>>");
		});

		test("with --log-level=none", async ({ expect }) => {
			const output = await getWranglerDevOutput("module", ["--log-level=none"]);
			expect(output).toMatchInlineSnapshot(`""`);
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
			expect(
				output.slice(
					output.indexOf("<<<<<this is a log>>>>>") - 1,
					output.indexOf("<<<<<this is an info message>>>>>") +
						"<<<<<this is an info message>>>>>".length +
						1
				)
			).toMatchInlineSnapshot(`
				"
				<<<<<this is a log>>>>>
				<<<<<this is a warning>>>>>
				<<<<<this is an error>>>>>
				<<<<<this is an info message>>>>>
				"
			`);
		});

		test("with --log-level=log", async ({ expect }) => {
			const output = await getWranglerDevOutput("service", ["--log-level=log"]);
			expect(
				output.slice(
					output.indexOf("<<<<<this is a log>>>>>") - 1,
					output.indexOf("<<<<<this is an info message>>>>>") +
						"<<<<<this is an info message>>>>>".length +
						1
				)
			).toMatchInlineSnapshot(`
				"
				<<<<<this is a log>>>>>
				<<<<<this is a warning>>>>>
				<<<<<this is an error>>>>>
				<<<<<this is an info message>>>>>
				"
			`);
		});

		test("with --log-level=info", async ({ expect }) => {
			const output = await getWranglerDevOutput("service", [
				"--log-level=info",
			]);
			expect(output).toMatchInlineSnapshot(`
				"<<<<<this is a warning>>>>>
				<<<<<this is an error>>>>>
				<<<<<this is an info message>>>>>
				"
			`);
		});

		test("with --log-level=warn", async ({ expect }) => {
			const output = await getWranglerDevOutput("service", [
				"--log-level=warn",
			]);
			expect(output).toMatchInlineSnapshot(`
				"<<<<<this is a warning>>>>>
				<<<<<this is an error>>>>>
				"
			`);
		});

		test("with --log-level=error", async ({ expect }) => {
			const output = await getWranglerDevOutput("service", [
				"--log-level=error",
			]);
			expect(output).toMatchInlineSnapshot(`
				"<<<<<this is an error>>>>>
				"
			`);
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
];
