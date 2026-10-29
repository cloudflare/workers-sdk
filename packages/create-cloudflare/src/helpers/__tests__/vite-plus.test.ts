import { runCommand } from "@cloudflare/cli-shared-helpers/command";
import { readJSON } from "helpers/files";
import { formatVitePlusProject } from "helpers/vite-plus";
import { beforeEach, describe, test, vi } from "vitest";
import { mockPackageManager } from "./mocks";
import type { C3Context } from "types";

vi.mock("@cloudflare/cli-shared-helpers/command");
vi.mock("helpers/files");
vi.mock("which-pm-runs");
const ctx = { project: { path: "/project" } } as C3Context;

beforeEach(() => vi.resetAllMocks());
describe("formatVitePlusProject", () => {
	test.for(["npm", "pnpm", "yarn", "bun"])(
		"formats generated files with %s",
		async (manager, { expect }) => {
			mockPackageManager(manager, "12.0.0");
			vi.mocked(readJSON).mockReturnValue({
				devDependencies: { "vite-plus": "1.4.0" },
			});
			await formatVitePlusProject(ctx);
			expect(runCommand).toHaveBeenCalledWith(
				[
					manager === "npm" ? "npx" : manager === "bun" ? "bunx" : manager,
					"vp",
					"fmt",
				],
				expect.objectContaining({ cwd: "/project", silent: true })
			);
		}
	);
	test("does not change projects without Vite+", async ({ expect }) => {
		vi.mocked(readJSON).mockReturnValue({});
		await formatVitePlusProject(ctx);
		expect(runCommand).not.toHaveBeenCalled();
	});
});
