import { mkdirSync, writeFileSync } from "node:fs";
import { CancelError } from "@cloudflare/cli-shared-helpers/error";
import { runInTempDir } from "@cloudflare/workers-utils/test-helpers";
import { mockPackageManager } from "helpers/__tests__/mocks";
import { runWranglerCommand } from "helpers/command";
import { beforeEach, describe, test, vi } from "vitest";
import { getDeploymentUrl } from "../deploy";

vi.mock("helpers/command");
vi.mock("which-pm-runs");

function writeDefaultWorkerConfig(name: string) {
	mkdirSync(".cloudflare/output/v0/workers/default", { recursive: true });
	writeFileSync(
		".cloudflare/output/v0/workers/default/worker.config.json",
		JSON.stringify({ name, compatibilityDate: "2026-01-01" })
	);
}

function cfWorkersGetOutput(subdomain: Record<string, unknown>) {
	return JSON.stringify({ id: "1234", name: "my-worker", subdomain });
}

describe("getDeploymentUrl", () => {
	runInTempDir();

	beforeEach(() => {
		mockPackageManager("npm");
	});

	test("looks up the workers.dev url of the default Worker", async ({
		expect,
	}) => {
		writeDefaultWorkerConfig("my-worker");
		vi.mocked(runWranglerCommand).mockResolvedValueOnce(
			cfWorkersGetOutput({
				enabled: true,
				url: "https://my-worker.example.workers.dev",
			})
		);

		await expect(getDeploymentUrl(".", "test1234")).resolves.toBe(
			"https://my-worker.example.workers.dev"
		);
		expect(runWranglerCommand).toHaveBeenCalledWith(
			["npx", "cf", "workers", "get", "my-worker"],
			expect.objectContaining({
				silent: true,
				env: { CLOUDFLARE_ACCOUNT_ID: "test1234" },
			})
		);
	});

	test("workers.dev disabled", async ({ expect }) => {
		writeDefaultWorkerConfig("my-worker");
		vi.mocked(runWranglerCommand).mockResolvedValueOnce(
			cfWorkersGetOutput({
				enabled: false,
				url: "https://my-worker.example.workers.dev",
			})
		);

		await expect(getDeploymentUrl(".", "test1234")).rejects.toThrow(
			"Failed to find deployment url: the `my-worker` Worker is not available on workers.dev."
		);
	});

	test("no Build Output", async ({ expect }) => {
		await expect(getDeploymentUrl(".", "test1234")).rejects.toThrow(
			"Failed to find deployment url: could not read the Worker's name from `.cloudflare/output/v0/workers/default/worker.config.json`."
		);
		expect(runWranglerCommand).not.toHaveBeenCalled();
	});

	test("cf workers get error", async ({ expect }) => {
		writeDefaultWorkerConfig("my-worker");
		vi.mocked(runWranglerCommand).mockRejectedValueOnce(
			new Error("Worker not found")
		);

		await expect(getDeploymentUrl(".", "test1234")).rejects.toThrow(
			"Failed to find deployment url: `cf workers get my-worker` failed.\nWorker not found"
		);
	});

	test("cancelled", async ({ expect }) => {
		writeDefaultWorkerConfig("my-worker");
		vi.mocked(runWranglerCommand).mockRejectedValueOnce(
			new CancelError("Command cancelled")
		);

		await expect(getDeploymentUrl(".", "test1234")).rejects.toThrow(
			CancelError
		);
	});
});
