import { afterEach, describe, it, vi } from "vitest";
import { getDeployConfirmFunction } from "../src/deploy/helpers/deploy-confirm";
import { logger } from "../src/shared/context";

vi.mock("@cloudflare/workers-utils", () => ({
	isNonInteractiveOrCI: () => true,
}));
vi.mock("../src/shared/context", () => ({
	confirm: vi.fn(),
	logger: { error: vi.fn() },
}));

const originalExitCode = process.exitCode;

afterEach(() => {
	vi.mocked(logger.error).mockClear();
	process.exitCode = originalExitCode;
});

describe("getDeployConfirmFunction", () => {
	it("keeps Wrangler's default strict-mode guidance", async ({ expect }) => {
		const confirm = getDeployConfirmFunction({ strictMode: true });

		expect(await confirm("Continue?")).toBe(false);
		expect(logger.error).toHaveBeenCalledWith(
			"Aborting the upload operation because of conflicts. To override and upload anyway, remove the `--strict` flag"
		);
		expect(process.exitCode).toBe(1);
	});

	it("uses a consumer-provided strict-mode message", async ({ expect }) => {
		const message =
			"Aborting the upload operation because of conflicts. Rerun with `cf deploy --force` to override and upload anyway.";
		const confirm = getDeployConfirmFunction({
			strictMode: true,
			strictModeAbortMessage: message,
		});

		expect(await confirm("Continue?")).toBe(false);
		expect(logger.error).toHaveBeenCalledWith(message);
		expect(process.exitCode).toBe(1);
	});
});
