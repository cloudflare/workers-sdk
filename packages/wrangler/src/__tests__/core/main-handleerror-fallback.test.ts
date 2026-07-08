import { afterEach, describe, it, vi } from "vitest";
import * as handleErrorsModule from "../../core/handle-errors";
import { main } from "../../index";

describe("main() handleError fallback", () => {
	afterEach(() => {
		vi.restoreAllMocks();
	});

	it("writes original error to stderr when handleError throws", async ({
		expect,
	}) => {
		const stderrWrites: string[] = [];
		vi.spyOn(process.stderr, "write").mockImplementation((chunk) => {
			stderrWrites.push(String(chunk));
			return true;
		});
		vi.spyOn(handleErrorsModule, "handleError").mockRejectedValue(
			new Error("logger unavailable")
		);

		await expect(main(["--xyz-flag-does-not-exist"])).rejects.toThrow();

		const written = stderrWrites.join("");
		expect(written).toContain("xyz-flag-does-not-exist");
	});
});
