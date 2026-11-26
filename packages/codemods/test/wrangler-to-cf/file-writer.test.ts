import { access, open, unlink } from "node:fs/promises";
import path from "node:path";
import { runInTempDir } from "@cloudflare/workers-utils/test-helpers";
import { afterEach, describe, it, vi } from "vitest";
import { writeMigrationOutputs } from "../../src/codemods/wrangler-to-cf/file-writer";

vi.mock("node:fs/promises", async (importOriginal) => {
	const actual = await importOriginal<typeof import("node:fs/promises")>();
	return {
		...actual,
		open: vi.fn(actual.open),
		unlink: vi.fn(actual.unlink),
	};
});

describe("writeMigrationOutputs", () => {
	runInTempDir();

	afterEach(() => {
		vi.clearAllMocks();
	});

	it("removes files created before a later write fails", async ({ expect }) => {
		const cloudflareConfigPath = path.join(
			process.cwd(),
			"cloudflare.config.ts"
		);
		const wranglerConfigPath = path.join(
			process.cwd(),
			"missing",
			"wrangler.config.ts"
		);

		await expect(
			writeMigrationOutputs(
				new Map([
					[cloudflareConfigPath, "export default {};\n"],
					[wranglerConfigPath, "export default {};\n"],
				])
			)
		).rejects.toMatchObject({ code: "ENOENT" });
		await expect(access(cloudflareConfigPath)).rejects.toMatchObject({
			code: "ENOENT",
		});
	});

	it("removes the current file when writing it fails", async ({ expect }) => {
		const filePath = path.join(process.cwd(), "cloudflare.config.ts");
		const writeError = new Error("write failed");
		const close = vi.fn().mockResolvedValue(undefined);
		const writeFile = vi.fn().mockRejectedValue(writeError);
		vi.mocked(open).mockResolvedValueOnce({
			close,
			writeFile,
		} as unknown as Awaited<ReturnType<typeof open>>);
		vi.mocked(unlink).mockResolvedValueOnce();

		await expect(
			writeMigrationOutputs(new Map([[filePath, "export default {};\n"]]))
		).rejects.toBe(writeError);

		expect(close).toHaveBeenCalledOnce();
		expect(unlink).toHaveBeenCalledWith(filePath);
	});
});
