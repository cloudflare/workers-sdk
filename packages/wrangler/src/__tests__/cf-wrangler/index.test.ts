import { describe, it, vi } from "vitest";
import { runCfWrangler } from "../../cf-wrangler";
import { runDev } from "../../cf-wrangler/dev";

vi.mock("../../cf-wrangler/dev", () => ({
	runDev: vi.fn(),
}));

describe("cf-wrangler runCfWrangler", () => {
	it("dispatches `dev` to runDev with the remaining argv", async ({
		expect,
	}) => {
		vi.mocked(runDev).mockResolvedValue(0);

		const code = await runCfWrangler(["dev", "--port", "8788", "--local"]);

		expect(code).toBe(0);
		expect(runDev).toHaveBeenCalledWith(["--port", "8788", "--local"]);
	});

	it("rejects an unknown subcommand with exit code 2", async ({ expect }) => {
		const stderr = vi.spyOn(process.stderr, "write").mockReturnValue(true);

		const code = await runCfWrangler(["build"]);

		expect(code).toBe(2);
		expect(runDev).not.toHaveBeenCalled();
		expect(stderr).toHaveBeenCalledWith(
			expect.stringContaining('unknown subcommand "build"')
		);

		stderr.mockRestore();
	});

	it("rejects a missing subcommand with exit code 2", async ({ expect }) => {
		const stderr = vi.spyOn(process.stderr, "write").mockReturnValue(true);

		const code = await runCfWrangler([]);

		expect(code).toBe(2);
		expect(runDev).not.toHaveBeenCalled();

		stderr.mockRestore();
	});
});
