import { existsSync } from "fs";
import { runCommand } from "helpers/command";
import { installPackages, installWrangler, npmInstall } from "helpers/packages";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import whichPMRuns from "which-pm-runs";
import { createTestContext } from "../../__tests__/helpers";
import { mockPackageManager } from "./mocks";

vi.mock("fs");
vi.mock("which-pm-runs");
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
			await npmInstall(createTestContext());

			expect(vi.mocked(runCommand)).toHaveBeenCalledWith(
				["npm", "install", "--legacy-peer-deps"],
				expect.anything(),
			);
		});

		test("pnpm", async () => {
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
			{
				pm: "npm",
				initialArgs: ["npm", "install"],
				additionalArgs: ["--legacy-peer-deps"],
			},
			{ pm: "pnpm", initialArgs: ["pnpm", "install"] },
			{ pm: "bun", initialArgs: ["bun", "add"] },
			{ pm: "yarn", initialArgs: ["yarn", "add"] },
		];

		test.each(cases)(
			"with $pm",
			async ({ pm, initialArgs, additionalArgs }) => {
				mockPackageManager(pm);
				const packages = ["foo", "bar", "baz"];
				await installPackages(packages);

				expect(vi.mocked(runCommand)).toHaveBeenCalledWith(
					[...initialArgs, ...packages, ...(additionalArgs ?? [])],
					expect.anything(),
				);
			},
		);

		const devCases: TestCase[] = [
			{
				pm: "npm",
				initialArgs: ["npm", "install", "--save-dev"],
				additionalArgs: ["--legacy-peer-deps"],
			},
			{ pm: "pnpm", initialArgs: ["pnpm", "install", "--save-dev"] },
			{ pm: "bun", initialArgs: ["bun", "add", "-d"] },
			{ pm: "yarn", initialArgs: ["yarn", "add", "-D"] },
		];

		test.each(devCases)(
			"with $pm (dev = true)",
			async ({ pm, initialArgs, additionalArgs }) => {
				mockPackageManager(pm);
				const packages = ["foo", "bar", "baz"];
				await installPackages(packages, { dev: true });

				expect(vi.mocked(runCommand)).toHaveBeenCalledWith(
					[...initialArgs, ...packages, ...(additionalArgs ?? [])],
					expect.anything(),
				);
			},
		);
	});

	test("installWrangler", async () => {
		await installWrangler();

		expect(vi.mocked(runCommand)).toHaveBeenCalledWith(
			["npm", "install", "--save-dev", "wrangler@latest", "--legacy-peer-deps"],
			expect.anything(),
		);
	});
});
