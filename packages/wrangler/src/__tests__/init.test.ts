import { execa } from "execa";
import { vi } from "vitest";
import { getPackageManager } from "../package-manager";
import { mockConsoleMethods } from "./helpers/mock-console";
import { useMockIsTTY } from "./helpers/mock-istty";
import { runInTempDir } from "./helpers/run-in-tmp";
import { runWrangler } from "./helpers/run-wrangler";
import type { PackageManager } from "../package-manager";
import type { Mock } from "vitest";

describe("init", () => {
	runInTempDir();
	const { setIsTTY } = useMockIsTTY();
	const std = mockConsoleMethods();
	let mockPackageManager: PackageManager;
	beforeEach(() => {
		setIsTTY(true);

		mockPackageManager = {
			cwd: process.cwd(),
			type: "mockpm" as "npm",
			addDevDeps: vi.fn(),
			install: vi.fn(),
		};
		(getPackageManager as Mock).mockResolvedValue(mockPackageManager);
	});

	describe("cli functionality", () => {
		afterEach(() => {});

		it("Delegates to create cloudflare", async () => {
			await runWrangler("init");
			console.log(std.out);
			expect(execa).toHaveBeenCalledWith(
				"mockpm",
				["create", "cloudflare@2.5.0"],
				{
					stdio: "inherit",
				}
			);
		});
	});
});
