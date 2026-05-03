import { writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { parsePackageJSON, readFileSync } from "@cloudflare/workers-utils";
import { afterEach, describe, test, vi } from "vitest";
import { runCommand } from "../command";
import { installPackages, installWrangler } from "../packages";

vi.mock("../command");
vi.mock("@cloudflare/workers-utils", () => ({
	readFileSync: vi.fn(),
	parsePackageJSON: vi.fn(),
}));
vi.mock("node:fs/promises", () => ({
	writeFile: vi.fn(),
}));

describe("Package Helpers", () => {
	afterEach(() => {
		vi.clearAllMocks();
	});

	describe("installPackages", async () => {
		type TestCase = {
			pm: "npm" | "pnpm" | "yarn" | "bun";
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
				const mockPkgJson = {
					dependencies: {
						foo: "^1.0.0",
						bar: "^2.0.0",
						baz: "^1.2.3",
					},
				};
				vi.mocked(readFileSync).mockReturnValue(JSON.stringify(mockPkgJson));
				vi.mocked(parsePackageJSON).mockReturnValue(mockPkgJson);

				const packages = ["foo", "bar@latest", "baz@1.2.3"];
				await installPackages(pm, packages);

				expect(vi.mocked(runCommand)).toHaveBeenCalledWith(
					[...initialArgs, ...packages, ...(additionalArgs ?? [])],
					expect.anything()
				);

				if (pm === "npm") {
					const writeFileCall = vi.mocked(writeFile).mock.calls[0];
					expect(writeFileCall[0]).toBe(resolve(process.cwd(), "package.json"));
					expect(JSON.parse(writeFileCall[1] as string)).toMatchObject({
						dependencies: {
							foo: "^1.0.0",
							bar: "^2.0.0",
							baz: "1.2.3",
						},
					});
				}
			}
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
				const mockPkgJson = {
					devDependencies: {
						foo: "^1.0.0",
						bar: "^2.0.0",
						baz: "^1.2.3",
					},
				};
				vi.mocked(readFileSync).mockReturnValue(JSON.stringify(mockPkgJson));
				vi.mocked(parsePackageJSON).mockReturnValue(mockPkgJson);

				const packages = ["foo", "bar@latest", "baz@1.2.3"];
				await installPackages(pm, packages, { dev: true });

				expect(vi.mocked(runCommand)).toHaveBeenCalledWith(
					[...initialArgs, ...packages, ...(additionalArgs ?? [])],
					expect.anything()
				);

				if (pm === "npm") {
					const writeFileCall = vi.mocked(writeFile).mock.calls[0];
					expect(writeFileCall[0]).toBe(resolve(process.cwd(), "package.json"));
					expect(JSON.parse(writeFileCall[1] as string)).toMatchObject({
						devDependencies: {
							foo: "^1.0.0",
							bar: "^2.0.0",
							baz: "1.2.3",
						},
					});
				}
			}
		);
	});

	test("installWrangler", async ({ expect }) => {
		const mockPkgJson = {
			devDependencies: {
				wrangler: "^4.0.0",
			},
		};
		vi.mocked(readFileSync).mockReturnValue(JSON.stringify(mockPkgJson));
		vi.mocked(parsePackageJSON).mockReturnValue(mockPkgJson);

		await installWrangler("npm", false);

		expect(vi.mocked(runCommand)).toHaveBeenCalledWith(
			["npm", "install", "--save-dev", "wrangler@latest"],
			expect.anything()
		);
	});
});
