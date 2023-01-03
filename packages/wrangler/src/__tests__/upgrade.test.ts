import { readFileSync, writeFileSync } from "fs";
import { execaSync } from "execa";
import { rest } from "msw";
import { mockConsoleMethods } from "./helpers/mock-console";
import { useMockIsTTY } from "./helpers/mock-istty";
import { msw } from "./helpers/msw";
import { runInTempDir } from "./helpers/run-in-tmp";
import { runWrangler } from "./helpers/run-wrangler";
import writeWranglerToml from "./helpers/write-wrangler-toml";

jest.mock("execa", () => {
	return {
		execaSync: jest.fn(),
	};
});

describe("Upgrade", () => {
	runInTempDir();
	const std = mockConsoleMethods();
	const { setIsTTY } = useMockIsTTY();

	afterAll(() => {
		jest.unmock("execa");
	});

	beforeEach(() => {
		setIsTTY(false);
		writeFileSync(
			"package.json",
			JSON.stringify({
				devDependencies: {
					wrangler: "NOT-UPDATED",
				},
			})
		);
		msw.use(
			rest.get("https://registry.npmjs.org/wrangler", (req, res, ctx) => {
				return res.once(
					ctx.status(200),
					ctx.json({
						"dist-tags": {
							latest: "UPDATED-1701D",
						},
					})
				);
			})
		);
	});

	it("should change the version in package.json to the latest in npm registry", async () => {
		writeWranglerToml();
		writeFileSync("pnpm-lock.yaml", "");
		await runWrangler("upgrade");

		expect(
			(
				JSON.parse(readFileSync("./package.json", "utf8")) as {
					devDependencies: {
						wrangler: string;
					};
				}
			).devDependencies.wrangler
		).toBe("UPDATED-1701D");
		expect(std.out).toMatchInlineSnapshot(`"✨ Wrangler upgrade complete! 🎉"`);
		expect(execaSync).toHaveBeenCalledWith("pnpm", ["install"]);
	});

	it("should give an error message when Wrangler config can't be found", async () => {
		await runWrangler("upgrade");

		expect(std.err).toMatchInlineSnapshot(`
		"[31mX [41;31m[[41;97mERROR[41;31m][0m [1m🚨 Wrangler failed to find a Worker project in the current directory.[0m

		"
	`);
	});

	it("should give an error message when fetch to NPM registry fails", async () => {
		writeWranglerToml();
		msw.use(
			rest.get("https://registry.npmjs.org/wrangler", (_, res) => {
				return res.networkError("Some Network error on Fetch to NPM");
			})
		);
		await expect(runWrangler("upgrade")).rejects.toMatchInlineSnapshot(
			`[Error: Wrangler upgrade failed: FetchError: request to https://registry.npmjs.org/wrangler failed, reason: Some Network error on Fetch to NPM]`
		);
	});

	it("should give an error message when no lockfile can be found", async () => {
		writeWranglerToml();
		await runWrangler("upgrade");
		expect(std.err).toMatchInlineSnapshot(`
		"[31mX [41;31m[[41;97mERROR[41;31m][0m [1m🚨 No lockfile found, unable to determine package manager.[0m

		"
	`);
	});
	it("should give an error message when Wrangler is not present in package.json", async () => {
		writeWranglerToml();
		writeFileSync("package-lock.json", "");
		writeFileSync(
			"package.json",
			JSON.stringify({
				devDependencies: {},
			})
		);
		await runWrangler("upgrade");
		expect(std.err).toMatchInlineSnapshot(`
		"[31mX [41;31m[[41;97mERROR[41;31m][0m [1m🚨 Unable to locate Wrangler in project package.json[0m

		"
	`);
	});
});
