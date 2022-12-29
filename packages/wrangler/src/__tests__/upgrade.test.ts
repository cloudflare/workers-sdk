import { readFileSync, writeFileSync } from "fs";
import { rest } from "msw";
import { mockConsoleMethods } from "./helpers/mock-console";
import { useMockIsTTY } from "./helpers/mock-istty";
import { msw } from "./helpers/msw";
import { runInTempDir } from "./helpers/run-in-tmp";
import { runWrangler } from "./helpers/run-wrangler";
import writeWranglerToml from "./helpers/write-wrangler-toml";

describe("Upgrade", () => {
	runInTempDir();
	const std = mockConsoleMethods();
	const { setIsTTY } = useMockIsTTY();

	beforeEach(() => {
		setIsTTY(false);
		writeFileSync(
			"package.json",
			JSON.stringify({
				dependencies: {
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
		await runWrangler("upgrade");

		expect(
			(
				JSON.parse(readFileSync("./package.json", "utf8")) as {
					dependencies: {
						wrangler: string;
					};
				}
			).dependencies.wrangler
		).toBe("UPDATED-1701D");
	});
	it("should give an error message when Wrangler config can't be found", async () => {
		await runWrangler("upgrade");

		expect(std.err).toMatchInlineSnapshot(`
		"[31mX [41;31m[[41;97mERROR[41;31m][0m [1mFailed to find a Wrangler configuration file, unable to determine location of Worker package.json.[0m

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
});
