import { existsSync } from "fs";
import { installPackages, installWrangler, npmInstall } from "helpers/packages";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import whichPMRuns from "which-pm-runs";
import { createTestContext } from "../../__tests__/helpers";
import { mockPackageManager, mockRunCommand } from "./mocks";
import type { PmName } from "helpers/packageManagers";

vi.mock("fs");
vi.mock("which-pm-runs");
vi.mock("helpers/command");

describe("Package Helpers", () => {
	beforeEach(() => {
		vi.mocked(whichPMRuns).mockReturnValue({ name: "npm", version: "8.3.1" });
		vi.mocked(existsSync).mockImplementation(() => false);
	});

	afterEach(() => {});

	describe("npmInstall", () => {
		test("npm", async () => {
			const { mock } = mockRunCommand();

			await npmInstall(createTestContext());

			expect(mock).toHaveBeenCalledWith(["npm", "install"], expect.anything());
		});

		test("pnpm", async () => {
			const { mock } = mockRunCommand();
			mockPackageManager("pnpm", "8.5.1");

			await npmInstall(createTestContext());
			expect(mock).toHaveBeenCalledWith(["pnpm", "install"], expect.anything());
		});
	});

	describe("installPackages", async () => {
		type TestCase = {
			pm: PmName;
			initialArgs: string[];
		};

		const cases: TestCase[] = [
			{ pm: "npm", initialArgs: ["npm", "install", "--save"] },
			{ pm: "pnpm", initialArgs: ["pnpm", "install", "--save"] },
			{ pm: "bun", initialArgs: ["bun", "add"] },
			{ pm: "yarn", initialArgs: ["yarn", "add"] },
		];

		test.each(cases)("with $pm", async ({ pm, initialArgs }) => {
			mockPackageManager(pm);
			const { mock } = mockRunCommand("");

			const packages = ["foo", "bar", "baz"];
			await installPackages(packages);

			expect(mock).toHaveBeenCalledWith(
				[...initialArgs, ...packages],
				expect.anything()
			);
		});

		const devCases: TestCase[] = [
			{ pm: "npm", initialArgs: ["npm", "install", "--save-dev"] },
			{ pm: "pnpm", initialArgs: ["pnpm", "install", "--save-dev"] },
			{ pm: "bun", initialArgs: ["bun", "add", "-d"] },
			{ pm: "yarn", initialArgs: ["yarn", "add", "-D"] },
		];

		test.each(devCases)(
			"with $pm (dev = true)",
			async ({ pm, initialArgs }) => {
				mockPackageManager(pm);
				const { mock } = mockRunCommand("");

				const packages = ["foo", "bar", "baz"];
				await installPackages(packages, { dev: true });

				expect(mock).toHaveBeenCalledWith(
					[...initialArgs, ...packages],
					expect.anything()
				);
			}
		);
	});

	test("installWrangler", async () => {
		await installWrangler();

		const { mock } = mockRunCommand();
		expect(mock).toHaveBeenCalledWith(
			["npm", "install", "--save-dev", "wrangler"],
			expect.anything()
		);
	});
});
