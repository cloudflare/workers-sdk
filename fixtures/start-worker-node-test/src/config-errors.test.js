import assert from "node:assert";
import test, { describe } from "node:test";
import { setTimeout } from "node:timers/promises";
import getPort from "get-port";
import { unstable_startWorker } from "wrangler";

describe("startWorker - configuration errors", () => {
	test("providing an incorrect entrypoint to startWorker", async () => {
		await assert.rejects(
			unstable_startWorker({
				entrypoint: "not a real entrypoint",
			}),
			(err) => {
				assert(err instanceof Error);
				assert.strictEqual(
					err.message,
					"An error occurred when starting the server"
				);
				const cause = err.cause;
				assert(cause instanceof Error);
				assert.match(
					cause.message,
					/The entry-point file at "not a real entrypoint" was not found./
				);
				return true;
			}
		);
	});

	test("providing a non existing config file to startWorker", async () => {
		await assert.rejects(
			unstable_startWorker({ config: "non-existing-config" }),
			(err) => {
				assert(err instanceof Error);
				assert.strictEqual(
					err.message,
					"An error occurred when starting the server"
				);
				const cause = err.cause;
				assert(cause instanceof Error);
				assert.match(
					cause.message,
					/Missing entry-point to Worker script or to assets directory/
				);
				return true;
			}
		);
	});

	test("providing an incorrect config to setConfig", async () => {
		const worker = await unstable_startWorker({
			config: "wrangler.json",
			dev: {
				server: {
					port: await getPort(),
				},
				inspector: false,
			},
		});

		await assert.rejects(
			worker.setConfig({ config: "non-existing-config" }, true),
			(err) => {
				assert(err instanceof Error);
				assert.match(
					err.message,
					/Missing entry-point to Worker script or to assets directory/
				);
				return true;
			}
		);

		await worker.dispose();
	});

	test("providing an incorrect entrypoint to setConfig", async () => {
		const worker = await unstable_startWorker({
			config: "wrangler.json",
			dev: {
				server: {
					port: await getPort(),
				},
				inspector: false,
			},
		});

		await assert.rejects(
			worker.setConfig({ entrypoint: "not a real entrypoint" }, true),
			(err) => {
				assert(err instanceof Error);
				assert.strictEqual(
					err.message,
					'The entry-point file at "not a real entrypoint" was not found.'
				);
				return true;
			}
		);

		await worker.dispose();
	});
});
