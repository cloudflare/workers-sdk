import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { runCommand } from "helpers/command";
import { installPackages, installWrangler, npmInstall } from "helpers/packages";
import { afterEach, beforeEach, describe, test, vi } from "vitest";
import whichPMRuns from "which-pm-runs";
import { createTestContext } from "../../__tests__/helpers";
import * as files from "../files";
import { mockPackageManager } from "./mocks";

vi.mock("fs");
vi.mock("which-pm-runs");
vi.mock("which-pm-runs");
vi.mock("helpers/command");
vi.mock("../files", () => ({
	readJSON: vi.fn(),
	writeJSON: vi.fn(),
}));
const mockReadJSON = vi.mocked(files.readJSON);
const mockWriteJSON = vi.mocked(files.writeJSON);

describe("Package Helpers", () => {
	beforeEach(() => {
		vi.mocked(whichPMRuns).mockReturnValue({ name: "npm", version: "8.3.1" });
		vi.mocked(existsSync).mockImplementation(() => false);
	});

	afterEach(() => {
		vi.clearAllMocks();
	});

	describe("npmInstall", () => {
		test("npm", async ({ expect }) => {
			await npmInstall(createTestContext());

			expect(vi.mocked(runCommand)).toHaveBeenCalledWith(
				["npm", "install"],
				expect.anything(),
			);
		});

		test("pnpm", async ({ expect }) => {
			mockPackageManager("pnpm", "8.5.1");

			await npmInstall(createTestContext());
			expect(vi.mocked(runCommand)).toHaveBeenCalledWith(
				["pnpm", "install"],
				expect.anything(),
			);
		});
	});

	describe("installPackages", async () => {
		type TestCase = {
			pm: string;
			initialArgs: string[];
			additionalArgs?: string[];
		};

		const cases: TestCase[] = [
			{ pm: "npm", initialArgs: ["npm", "install"] },
			{ pm: "pnpm", initialArgs: ["pnpm", "install"] },
			{ pm: "bun", initialArgs: ["bun", "add"] },
			{ pm: "yarn", initialArgs: ["yarn", "add"] },
		];

		test.for(cases)(
			"with $pm",
			async ({ pm, initialArgs, additionalArgs }, { expect }) => {
				mockPackageManager(pm);
				mockReadJSON.mockReturnValue({
					["dependencies"]: {
						foo: "^1.0.0",
						bar: "^2.0.0",
						baz: "^1.2.3",
					},
				});
				const packages = ["foo", "bar@latest", "baz@1.2.3"];
				await installPackages(packages);

				expect(vi.mocked(runCommand)).toHaveBeenCalledWith(
					[...initialArgs, ...packages, ...(additionalArgs ?? [])],
					expect.anything(),
				);

				if (pm === "npm") {
					// Check that package.json was updated for npm
					expect(mockReadJSON).toHaveBeenCalledWith(
						resolve(process.cwd(), "package.json"),
					);
					expect(mockWriteJSON).toHaveBeenCalledWith(
						resolve(process.cwd(), "package.json"),
						expect.objectContaining({
							["dependencies"]: {
								foo: "^1.0.0",
								bar: "^2.0.0",
								baz: "1.2.3",
							},
						}),
					);
				}
			},
		);

		const devCases: TestCase[] = [
			{ pm: "npm", initialArgs: ["npm", "install", "--save-dev"] },
			{ pm: "pnpm", initialArgs: ["pnpm", "install", "--save-dev"] },
			{ pm: "bun", initialArgs: ["bun", "add", "-d"] },
			{ pm: "yarn", initialArgs: ["yarn", "add", "-D"] },
		];

		test.for(devCases)(
			"with $pm (dev = true)",
			async ({ pm, initialArgs, additionalArgs }, { expect }) => {
				mockPackageManager(pm);
				mockReadJSON.mockReturnValue({
					["devDependencies"]: {
						foo: "^1.0.0",
						bar: "^2.0.0",
						baz: "^1.2.3",
					},
				});
				const packages = ["foo", "bar@latest", "baz@1.2.3"];
				await installPackages(packages, { dev: true });

				expect(vi.mocked(runCommand)).toHaveBeenCalledWith(
					[...initialArgs, ...packages, ...(additionalArgs ?? [])],
					expect.anything(),
				);

				if (pm === "npm") {
					// Check that package.json was updated for npm
					expect(mockReadJSON).toHaveBeenCalledWith(
						resolve(process.cwd(), "package.json"),
					);
					expect(mockWriteJSON).toHaveBeenCalledWith(
						resolve(process.cwd(), "package.json"),
						expect.objectContaining({
							["devDependencies"]: {
								foo: "^1.0.0",
								bar: "^2.0.0",
								baz: "1.2.3",
							},
						}),
					);
				}
			},
		);
	});

	test("installWrangler", async ({ expect }) => {
		mockReadJSON.mockReturnValue({
			["devDependencies"]: {
				wrangler: "^4.0.0",
			},
		});
		await installWrangler();

		expect(vi.mocked(runCommand)).toHaveBeenCalledWith(
			["npm", "install", "--save-dev", "wrangler@latest"],
			expect.anything(),
		);
	});
});
