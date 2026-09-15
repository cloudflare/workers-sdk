import assert from "node:assert";
import { execFileSync, spawnSync } from "node:child_process";
import { afterAll, beforeAll, describe, test, vi } from "vitest";
import { createTestHarness } from "wrangler";

const isCINonLinux = process.platform !== "linux" && process.env.CI === "true";

function isDockerRunning() {
	try {
		execFileSync("docker", ["ps"], { stdio: "ignore" });
		return true;
	} catch {
		return false;
	}
}

/** Indicates whether the test is being run locally (not in CI) AND docker is currently not running on the system */
const isLocalWithoutDockerRunning =
	process.env.CI !== "true" && !isDockerRunning();

if (isLocalWithoutDockerRunning) {
	console.warn(
		"The tests are running locally but there is no docker instance running on the system, skipping containers tests"
	);
}

describe.skipIf(
	isCINonLinux ||
		// If the tests are being run locally and docker is not running we just skip this test
		isLocalWithoutDockerRunning
)("container app", () => {
	const server = createTestHarness({
		workers: [{ configPath: "./wrangler.jsonc" }],
	});
	let runtimeContainerIds: string[] = [];

	beforeAll(async () => {
		await server.listen();
	});

	afterAll(async () => {
		await server.close();
		const remainingIds = runtimeContainerIds.filter(
			(id) => spawnSync("docker", ["inspect", id]).status === 0
		);
		assert.deepStrictEqual(remainingIds, []);
	});

	test("starts and fetches from the container", async ({ expect }) => {
		const statusResponse = await server.fetch("/status");
		expect(await statusResponse.json()).toBe(false);

		const startResponse = await server.fetch("/start");
		expect(await startResponse.text()).toBe("Container create request sent...");

		await vi.waitFor(
			async () => {
				const fetchResponse = await server.fetch("/fetch");
				expect(await fetchResponse.text()).toBe(
					"Hello World! Have an env var! I'm an env var!"
				);
			},
			{ interval: 500, timeout: 30_000 }
		);

		runtimeContainerIds = execFileSync(
			"docker",
			["ps", "-q", "--filter", "name=workerd-container-app"],
			{ encoding: "utf8" }
		)
			.trim()
			.split("\n")
			.filter(Boolean);
		expect(runtimeContainerIds).toHaveLength(2);
	});
});
