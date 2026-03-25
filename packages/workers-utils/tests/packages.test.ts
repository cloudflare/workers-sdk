import { resolve } from "node:path";
import { afterEach, beforeEach, describe, test, vi } from "vitest";
import { runCommand } from "../src/command-helpers";
import {
	BunPackageManager,
	NpmPackageManager,
	PnpmPackageManager,
	YarnPackageManager,
} from "../src/package-managers";
import { installPackages, installWrangler } from "../src/packages";
import { parsePackageJSON, readFileSync } from "../src/parse";

vi.mock("../src/command-helpers");
vi.mock("node:fs/promises");
vi.mock("../src/parse", async (importOriginal) => {
	// oxlint-disable-next-line typescript/consistent-type-imports
	const original = await importOriginal<typeof import("../src/parse")>();
	return {
		...original,
		parsePackageJSON: vi.fn(),
		readFileSync: vi.fn(),
	};
});

describe("Package Helpers", () => {
	beforeEach(() => {
		vi.mocked(readFileSync).mockReturnValue("");
		vi.mocked(parsePackageJSON).mockReturnValue({
			dependencies: {},
			devDependencies: {},
		} as ReturnType<typeof parsePackageJSON>);
	});

	afterEach(() => {
		vi.clearAllMocks();
	});

	describe("installPackages", async () => {
		type TestCase = {
			pm: string;
			initialArgs: string[];
			additionalArgs?: string[];
		};

		const pmMap = {
			npm: NpmPackageManager,
			pnpm: PnpmPackageManager,
			bun: BunPackageManager,
			yarn: YarnPackageManager,
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
				vi.mocked(parsePackageJSON).mockReturnValue({
					dependencies: {
						foo: "^1.0.0",
						bar: "^2.0.0",
						baz: "^1.2.3",
					},
				} as ReturnType<typeof parsePackageJSON>);

				const packages = ["foo", "bar@latest", "baz@1.2.3"];
				await installPackages(pmMap[pm as keyof typeof pmMap], packages);

				expect(vi.mocked(runCommand)).toHaveBeenCalledWith(
					[...initialArgs, ...packages, ...(additionalArgs ?? [])],
					expect.anything()
				);

				if (pm === "npm") {
					const { writeFile } = await import("node:fs/promises");
					// Check that package.json was updated for npm
					expect(writeFile).toHaveBeenCalledWith(
						resolve(process.cwd(), "package.json"),
						expect.stringContaining('"baz": "1.2.3"')
					);
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
				vi.mocked(parsePackageJSON).mockReturnValue({
					devDependencies: {
						foo: "^1.0.0",
						bar: "^2.0.0",
						baz: "^1.2.3",
					},
				} as ReturnType<typeof parsePackageJSON>);

				const packages = ["foo", "bar@latest", "baz@1.2.3"];
				await installPackages(pmMap[pm as keyof typeof pmMap], packages, {
					dev: true,
				});

				expect(vi.mocked(runCommand)).toHaveBeenCalledWith(
					[...initialArgs, ...packages, ...(additionalArgs ?? [])],
					expect.anything()
				);

				if (pm === "npm") {
					const { writeFile } = await import("node:fs/promises");
					// Check that package.json was updated for npm
					expect(writeFile).toHaveBeenCalledWith(
						resolve(process.cwd(), "package.json"),
						expect.stringContaining('"baz": "1.2.3"')
					);
				}
			}
		);
	});

	test("installWrangler", async ({ expect }) => {
		vi.mocked(parsePackageJSON).mockReturnValue({
			devDependencies: {
				wrangler: "^4.0.0",
			},
		} as ReturnType<typeof parsePackageJSON>);

		await installWrangler(NpmPackageManager, false);

		expect(vi.mocked(runCommand)).toHaveBeenCalledWith(
			["npm", "install", "--save-dev", "wrangler@latest"],
			expect.anything()
		);
	});
});
