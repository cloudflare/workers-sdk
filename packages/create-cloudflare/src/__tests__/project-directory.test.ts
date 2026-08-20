import { existsSync, mkdirSync } from "node:fs";
import { chdir } from "node:process";
import { resolve } from "node:path";
import { beforeEach, describe, test, vi } from "vitest";
import { setupProjectDirectory } from "../project-directory";
import type { C3Context } from "types";

vi.mock("node:fs");
vi.mock("node:process", async (importOriginal) => {
	const actual = await importOriginal<typeof import("node:process")>();
	return { ...actual, chdir: vi.fn() };
});

const ctxFor = (projectPath: string): C3Context =>
	({
		args: {},
		project: { name: "my-app", path: projectPath },
		template: {},
		deployment: {},
		originalCWD: "/",
		gitRepoAlreadyExisted: false,
	}) as unknown as C3Context;

describe("setupProjectDirectory", () => {
	beforeEach(() => {
		vi.resetAllMocks();
	});

	test("does not mkdir when the parent already exists", ({ expect }) => {
		const projectPath = resolve("already-there", "my-app");
		const parent = resolve("already-there");
		vi.mocked(existsSync).mockImplementation((p) => String(p) === parent);

		setupProjectDirectory(ctxFor(projectPath));

		expect(mkdirSync).not.toHaveBeenCalled();
		expect(chdir).toHaveBeenCalledWith(parent);
	});

	test("creates the parent when it is missing", ({ expect }) => {
		const projectPath = resolve("new-parent", "my-app");
		const parent = resolve("new-parent");
		vi.mocked(existsSync).mockReturnValue(false);

		setupProjectDirectory(ctxFor(projectPath));

		expect(mkdirSync).toHaveBeenCalledWith(parent, { recursive: true });
		expect(chdir).toHaveBeenCalledWith(parent);
	});
});
