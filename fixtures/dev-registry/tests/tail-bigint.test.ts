import * as fs from "node:fs/promises";
import * as os from "node:os";
import * as path from "node:path";
import { resolve } from "node:path";
/* eslint-disable workers-sdk/no-vitest-import-expect -- uses expect in module-scope helper functions */
import {
	describe,
	expect,
	onTestFailed,
	onTestFinished,
	test,
	vi,
} from "vitest";
/* eslint-enable workers-sdk/no-vitest-import-expect */
import {
	runLongLived,
	waitForReady,
} from "../../../packages/vite-plugin-cloudflare/e2e/helpers";
import { runWranglerDev as baseRunWranglerDev } from "../../shared/src/run-wrangler-long-lived";

// Regression tests for https://github.com/cloudflare/workers-sdk/issues/15249
//
// A tail event can carry a `bigint`: `TraceDiagnosticChannelEvent.message` is
// whatever the producer published on a `node:diagnostics_channel` channel.
// Tail events forwarded to a Worker running in `vite dev` go through the Vite
// plugin's proxy worker, which JSON round-trips them with a replacer that
// does not handle `bigint`, so `JSON.stringify()` throws
// `TypeError: Do not know how to serialize a BigInt` and the whole batch is
// dropped. The same events forwarded to `wrangler dev` go through miniflare's
// copy of the replacer, which does handle `bigint`.

const waitForTimeout = 20_000;
const cwd = resolve(__dirname, "..");
const tmpPathBase = path.join(os.tmpdir(), "wrangler-tests");

const it = test.extend<{
	devRegistryPath: string;
	producerConfigPath: string;
}>({
	async devRegistryPath({}, use) {
		const tmpPath = await fs.realpath(await fs.mkdtemp(tmpPathBase));

		// Registered during fixture setup so it runs after every dev session has
		// exited (`onTestFinished` callbacks run in LIFO order).
		onTestFinished(async () => {
			await fs.rm(tmpPath, { recursive: true, maxRetries: 10 });
		});

		await use(tmpPath);
	},
	// A producer Worker that logs a line and publishes a `bigint` on a
	// diagnostics channel in the same invocation, so its tail event carries both.
	async producerConfigPath({}, use) {
		const tmpPath = await fs.realpath(await fs.mkdtemp(tmpPathBase));

		onTestFinished(async () => {
			await fs.rm(tmpPath, { recursive: true, maxRetries: 10 });
		});

		await fs.writeFile(
			path.join(tmpPath, "index.js"),
			[
				`import { channel } from "node:diagnostics_channel";`,
				``,
				`export default {`,
				`\tfetch() {`,
				`\t\tconsole.log("[bigint-producer]");`,
				`\t\tchannel("bigint-test").publish(5n);`,
				`\t\treturn new Response("ok");`,
				`\t},`,
				`};`,
				``,
			].join("\n")
		);

		const configPath = path.join(tmpPath, "wrangler.jsonc");
		await fs.writeFile(
			configPath,
			JSON.stringify(
				{
					name: "bigint-producer",
					main: "./index.js",
					compatibility_date: "2025-05-01",
					compatibility_flags: ["nodejs_compat"],
					tail_consumers: [{ service: "exported-handler-with-assets" }],
				},
				null,
				"\t"
			)
		);

		await use(configPath);
	},
});

async function runViteDev(
	config: string,
	devRegistryPath: string
): Promise<string> {
	const proc = await runLongLived("pnpm", `vite --config ${config}`, cwd, {
		CLOUDFLARE_DEV_REGISTRY_PATH: devRegistryPath,
	});
	const url = await waitForReady(proc);

	onTestFailed(() => {
		console.log(`::group::Vite dev session (${config})`);
		console.log(proc.stdout);
		console.log(proc.stderr);
		console.log("::endgroup::");
	});

	await vi.waitFor(async () => {
		const response = await fetch(url, { method: "HEAD" });
		expect(response.status).toBe(200);
	}, waitForTimeout);

	return url;
}

async function runWranglerDev(config: string, devRegistryPath: string) {
	const session = await baseRunWranglerDev(
		cwd,
		["--port=0", "--inspector-port=0", `--config=${config}`],
		{ CLOUDFLARE_DEV_REGISTRY_PATH: devRegistryPath }
	);

	onTestFailed(() => {
		console.log(`::group::Wrangler dev session (${config})`);
		console.log(session.getOutput());
		console.log("::endgroup::");
	});
	onTestFinished(() => session.stop());

	const url = `http://${session.ip}:${session.port}`;

	await vi.waitFor(async () => {
		const response = await fetch(url);
		expect(response.status).not.toBeGreaterThan(500);
	}, waitForTimeout);

	return { url, getOutput: session.getOutput };
}

/**
 * Triggers the producer, then checks the consumer received its tail event.
 *
 * The producer's dev registry proxy reports a failed forward with a
 * `Failed to forward tail events` warning carrying the consumer's error, so
 * that is checked first to surface the real failure.
 */
async function expectTailEventForwarded(
	producer: { url: string; getOutput: () => string },
	consumerUrl: string
) {
	const searchParams = new URLSearchParams({ "test-method": "tail" });

	await vi.waitFor(async () => {
		await fetch(producer.url);

		const forwardingFailures = new Set(
			producer
				.getOutput()
				// eslint-disable-next-line no-control-regex -- strips ANSI colour codes
				.replace(/\x1b\[[0-9;]*m/g, "")
				.split("\n")
				.filter((line) => line.includes("Failed to forward tail events"))
				.map((line) => line.trim())
		);
		expect([...forwardingFailures]).toEqual([]);

		const response = await fetch(`${consumerUrl}?${searchParams}`);
		expect(await response.json()).toEqual({
			worker: "exported-handler",
			tailEvents: expect.arrayContaining([[["[bigint-producer]"]]]),
		});
	}, waitForTimeout);
}

describe("Dev Registry: tail events carrying a bigint", () => {
	it("are forwarded from wrangler dev to wrangler dev", async ({
		devRegistryPath,
		producerConfigPath,
	}) => {
		// Start the consumer before the producer, so the producer is torn down
		// first (see `startTailPair` in dev-registry.test.ts).
		const consumer = await runWranglerDev(
			"wrangler.exported-handler-with-assets.jsonc",
			devRegistryPath
		);
		const producer = await runWranglerDev(producerConfigPath, devRegistryPath);

		await expectTailEventForwarded(producer, consumer.url);
	});

	it("are forwarded from wrangler dev to vite dev", async ({
		devRegistryPath,
		producerConfigPath,
	}) => {
		// Start the consumer before the producer, so the producer is torn down
		// first (see `startTailPair` in dev-registry.test.ts).
		const consumerUrl = await runViteDev(
			"vite.exported-handler-with-assets.config.ts",
			devRegistryPath
		);
		const producer = await runWranglerDev(producerConfigPath, devRegistryPath);

		await expectTailEventForwarded(producer, consumerUrl);
	});
});
