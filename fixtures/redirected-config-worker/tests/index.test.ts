import { execSync, spawnSync } from "child_process";
import { resolve } from "path";
import { fetch } from "undici";
import { describe, expect, it, onTestFinished } from "vitest";
import { runWranglerDev } from "../../shared/src/run-wrangler-long-lived";

const basePath = resolve(__dirname, "..");

describe("'wrangler dev', when reading redirected config,", () => {
	it("uses the generated config", async () => {
		build("prod");
		const { ip, port, stop } = await runWranglerDev(basePath, [
			"--port=0",
			"--inspector-port=0",
		]);
		onTestFinished(async () => await stop?.());

		// Note that the local protocol defaults to http
		const response = await fetch(`http://${ip}:${port}/`);
		const text = await response.text();
		expect(response.status).toBe(200);
		expect(text).toMatchInlineSnapshot(`"Generated: prod"`);
	});

	it("works when specifying the same environment via CLI arg to the one used in build", async () => {
		build("production");

		const { ip, port, stop } = await runWranglerDev(basePath, [
			"--port=0",
			"--inspector-port=0",
			"--env=production",
		]);
		onTestFinished(async () => await stop?.());

		const response = await fetch(`http://${ip}:${port}/`);
		const text = await response.text();
		expect(response.status).toBe(200);
		expect(text).toMatchInlineSnapshot(`"Generated: production"`);
	});

	it("errors when specifying a different environment via CLI arg to the one used in build", async () => {
		build("production");

		const error = await runWranglerDev(basePath, [
			"--port=0",
			"--inspector-port=0",
			"--env=staging",
		]).then(
			// it is doesn't error then stop the process
			({ stop }) => stop(),
			(e) => e
		);

		expect(error).toMatch(
			'You have specified the environment "staging" via the `--env/-e` CLI argument.'
		);
		expect(error).toMatch(
			'This does not match the target environment "production" that was used when building the application.'
		);
		expect(error).toMatch(
			'Perhaps you need to re-run the custom build of the project with "staging" as the selected environment?'
		);
	});

	it("errors when specifying a different environment via CLOUDFLARE_ENV to the one used in build", async () => {
		build("production");

		let error = "";
		try {
			await runWranglerDev(basePath, ["--port=0", "--inspector-port=0"], {
				CLOUDFLARE_ENV: "staging",
			});
		} catch (e) {
			error = e as string;
		}

		expect(error).toMatch(
			'You have specified the environment "staging" via the CLOUDFLARE_ENV environment variable.'
		);
		expect(error).toMatch(
			'This does not match the target environment "production" that was used when building the application.'
		);
		expect(error).toMatch(
			'Perhaps you need to re-run the custom build of the project with "staging" as the selected environment?'
		);
	});

	it("uses a custom config from command line rather than generated config", async () => {
		const { ip, port, stop } = await runWranglerDev(basePath, [
			"-c=wrangler.jsonc",
			"--port=0",
			"--inspector-port=0",
		]);
		onTestFinished(async () => await stop?.());

		// Note that the local protocol defaults to http
		const response = await fetch(`http://${ip}:${port}/`);
		const text = await response.text();
		expect(response.status).toBe(200);
		expect(text).toMatchInlineSnapshot(`"Generated: false"`);
	});
});

describe("'wrangler deploy', when reading redirected config,", () => {
	it("uses the generated config", async () => {
		build("prod");
		const output = spawnSync("pnpm", ["wrangler", "deploy", "--dry-run"], {
			cwd: basePath,
			stdio: "pipe",
			shell: true,
			encoding: "utf-8",
		});
		expect(output.stdout).toContain(`Using redirected Wrangler configuration.`);
		expect(output.stdout.replace(/\\/g, "/")).toContain(
			` - Configuration being used: "build/wrangler.json"`
		);
		expect(output.stdout).toContain(
			` - Original user's configuration: "wrangler.jsonc"`
		);
		expect(output.stdout.replace(/\\/g, "/")).toContain(
			` - Deploy configuration file: ".wrangler/deploy/config.json"`
		);
		expect(output.stderr).toMatchInlineSnapshot(`""`);
	});
});

function build(env: string) {
	execSync("node -r esbuild-register tools/build.ts", {
		cwd: basePath,
		env: { ...process.env, CLOUDFLARE_ENV: env },
	});
}
