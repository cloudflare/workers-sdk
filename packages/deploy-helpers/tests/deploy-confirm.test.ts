import { isNonInteractiveOrCI } from "@cloudflare/workers-utils";
import { afterEach, beforeEach, describe, it, vi } from "vitest";
import { getDeployConfirmFunction } from "../src/deploy/helpers/deploy-confirm";
import { confirm as promptConfirm, logger } from "../src/shared/context";

vi.mock("@cloudflare/workers-utils", () => ({
	isNonInteractiveOrCI: vi.fn(),
}));
vi.mock("../src/shared/context", () => ({
	confirm: vi.fn(),
	logger: { error: vi.fn() },
}));

const originalExitCode = process.exitCode;

beforeEach(() => {
	vi.mocked(isNonInteractiveOrCI).mockReturnValue(true);
	process.exitCode = undefined;
});

afterEach(() => {
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

	it.for([undefined, false])(
		"continues non-interactively when strict mode is %j",
		async (strictMode, { expect }) => {
			const confirm = getDeployConfirmFunction({
				strictMode,
				strictModeAbortMessage: "Custom abort message",
			});

			expect(await confirm("Continue?")).toBe(true);
			expect(logger.error).not.toHaveBeenCalled();
			expect(promptConfirm).not.toHaveBeenCalled();
			expect(process.exitCode).toBeUndefined();
		}
	);

	it.for([true, false])(
		"preserves interactive confirmation when strict mode is %j",
		async (strictMode, { expect }) => {
			vi.mocked(isNonInteractiveOrCI).mockReturnValue(false);
			vi.mocked(promptConfirm).mockResolvedValue(false);
			const confirm = getDeployConfirmFunction({
				strictMode,
				strictModeAbortMessage: "Custom abort message",
			});

			expect(await confirm("Continue?")).toBe(false);
			expect(promptConfirm).toHaveBeenCalledWith("Continue?");
			expect(logger.error).not.toHaveBeenCalled();
			expect(process.exitCode).toBeUndefined();
		}
	);
});
