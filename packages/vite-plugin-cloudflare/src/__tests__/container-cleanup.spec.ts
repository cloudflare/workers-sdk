import { cleanupContainers } from "@cloudflare/containers-shared";
import { test, vi } from "vitest";
import { createContainerCleanup } from "../container-cleanup";

vi.mock("@cloudflare/containers-shared", () => ({
	cleanupContainers: vi.fn(),
}));

test("retains failed cleanup after an interrupted restart and retries only pending Docker targets", async ({
	expect,
	onTestFinished,
}) => {
	vi.mocked(cleanupContainers).mockReset().mockReturnValue(true);
	const cleanup = createContainerCleanup();
	onTestFinished(() => {
		vi.mocked(cleanupContainers).mockReturnValue(true);
		cleanup.cleanup();
	});
	cleanup.track("docker-a", ["old-a"]);
	cleanup.track("docker-b", ["old-b"]);
	vi.mocked(cleanupContainers).mockReturnValueOnce(false);
	await expect(
		cleanup.restart(async () => {
			expect(cleanup.isRestarting).toBe(true);
			throw new Error("preparation failed");
		})
	).rejects.toThrow("preparation failed");
	expect(cleanup.isRestarting).toBe(false);
	expect(cleanupContainers).toHaveBeenCalledTimes(2);
	cleanup.track("docker-a", ["new-a"]);
	cleanup.cleanup();
	expect(cleanupContainers).toHaveBeenCalledTimes(3);
	expect(cleanupContainers).toHaveBeenLastCalledWith(
		"docker-a",
		new Set(["old-a", "new-a"])
	);
	cleanup.cleanup();
	expect(cleanupContainers).toHaveBeenCalledTimes(3);
});
