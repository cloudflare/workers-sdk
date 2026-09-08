import path from "node:path";
import { describe, it, vi } from "vitest";
import { maybeHandleCodexMicroInvocation } from "../../codex-micro/invocation";

describe("Codex Micro hidden invocation", () => {
	it("leaves normal Wrangler arguments untouched", async ({ expect }) => {
		expect(await maybeHandleCodexMicroInvocation(["deploy"])).toBe(false);
	});

	it("installs only behind the secret flag", async ({ expect }) => {
		const install = vi.fn(async () => undefined);

		expect(
			await maybeHandleCodexMicroInvocation(
				["--secret", "--install-codex-daemon", "--cwd=/work/project"],
				{
					cliPath: "/opt/wrangler/cli.js",
					install,
				}
			)
		).toBe(true);
		expect(install).toHaveBeenCalledWith({
			cliPath: path.resolve("/opt/wrangler/cli.js"),
			projectPath: path.resolve("/work/project"),
		});
	});

	it("rejects daemon actions without the secret flag", async ({ expect }) => {
		const install = vi.fn(async () => undefined);

		await expect(
			maybeHandleCodexMicroInvocation(["--install-codex-daemon"], { install })
		).rejects.toThrow("Unknown argument.");
		expect(install).not.toHaveBeenCalled();
	});

	it("rejects multiple actions and unrelated arguments", async ({ expect }) => {
		await expect(
			maybeHandleCodexMicroInvocation([
				"--secret",
				"--install-codex-daemon",
				"--run-codex-daemon",
			])
		).rejects.toThrow("Specify exactly one Codex Micro daemon action.");
		await expect(
			maybeHandleCodexMicroInvocation([
				"--secret",
				"--run-codex-daemon",
				"--experimental",
			])
		).rejects.toThrow("Unknown argument: --experimental");
	});
});
