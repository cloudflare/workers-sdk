import { execSync } from "node:child_process";
import { describe, it, vi } from "vitest";
import { resolveGitBranchName } from "../src/shared/git-branch";

vi.mock("node:child_process", () => ({
	execSync: vi.fn(),
}));

describe("resolveGitBranchName Buffer stubs", () => {
	it("reads a Buffer stub the way Wrangler tests stub git", ({ expect }) => {
		vi.mocked(execSync)
			.mockReset()
			.mockImplementationOnce(() => Buffer.from("true") as unknown as string)
			.mockImplementationOnce(
				() => Buffer.from("feat/awesome-feature\n") as unknown as string
			);

		expect(resolveGitBranchName()).toBe("feat/awesome-feature");
	});
});
