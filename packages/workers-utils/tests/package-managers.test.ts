import { beforeEach, describe, test, vi } from "vitest";
import {
	BunPackageManager,
	NpmPackageManager,
	PnpmPackageManager,
	YarnPackageManager,
	getPackageManager,
} from "../src/package-managers";

vi.mock("execa");

describe("Package Managers", () => {
	beforeEach(() => {
		vi.unstubAllEnvs();
	});

	describe("getPackageManager", () => {
		describe("via npm_config_user_agent", () => {
			test("npm", async ({ expect }) => {
				vi.stubEnv("npm_config_user_agent", "npm/8.3.1");
				const { execaCommandSync } = await import("execa");
				vi.mocked(execaCommandSync).mockImplementation(() => {
					return {} as ReturnType<typeof execaCommandSync>;
				});

				const pm = await getPackageManager();
				expect(pm).toEqual(NpmPackageManager);
			});

			test("pnpm", async ({ expect }) => {
				vi.stubEnv("npm_config_user_agent", "pnpm/8.5.1");
				const { execaCommandSync } = await import("execa");
				vi.mocked(execaCommandSync).mockImplementation(() => {
					return {} as ReturnType<typeof execaCommandSync>;
				});

				const pm = await getPackageManager();
				expect(pm).toEqual(PnpmPackageManager);
			});

			test("yarn", async ({ expect }) => {
				vi.stubEnv("npm_config_user_agent", "yarn/3.5.1");
				const { execaCommandSync } = await import("execa");
				vi.mocked(execaCommandSync).mockImplementation(() => {
					return {} as ReturnType<typeof execaCommandSync>;
				});

				const pm = await getPackageManager();
				expect(pm).toEqual(YarnPackageManager);
			});

			test("bun", async ({ expect }) => {
				vi.stubEnv("npm_config_user_agent", "bun/1.0.0");
				const { execaCommandSync } = await import("execa");
				vi.mocked(execaCommandSync).mockImplementation(() => {
					return {} as ReturnType<typeof execaCommandSync>;
				});

				const pm = await getPackageManager();
				expect(pm).toEqual(BunPackageManager);
			});
		});

		describe("via installed tools (no user agent)", () => {
			beforeEach(() => {
				vi.stubEnv("npm_config_user_agent", undefined as unknown as string);
			});

			test.for([
				["npm", NpmPackageManager],
				["yarn", YarnPackageManager],
				["pnpm", PnpmPackageManager],
				["bun", BunPackageManager],
			] as const)("%s", async ([availablePm, expectedPm], { expect }) => {
				const { execaCommandSync } = await import("execa");
				vi.mocked(execaCommandSync).mockImplementation((cmd) => {
					if (!(cmd as string).startsWith(availablePm)) {
						throw new Error("not found");
					}
					return {} as ReturnType<typeof execaCommandSync>;
				});

				const pm = await getPackageManager();
				expect(pm).toEqual(expectedPm);
			});

			test("throws when no package manager is available", async ({
				expect,
			}) => {
				const { execaCommandSync } = await import("execa");
				vi.mocked(execaCommandSync).mockImplementation(() => {
					throw new Error("not found");
				});

				await expect(getPackageManager()).rejects.toThrow(
					"Unable to find a package manager"
				);
			});
		});
	});
});
