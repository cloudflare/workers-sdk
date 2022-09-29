import fs from "node:fs";
import { mockConsoleMethods } from "./helpers/mock-console";
import { mockConfirm, clearConfirmMocks } from "./helpers/mock-dialogs";
import { runInTempDir } from "./helpers/run-in-tmp";
import { runWrangler } from "./helpers/run-wrangler";

describe("generate", () => {
	runInTempDir();

	describe("cli functionality", () => {
		const std = mockConsoleMethods();

		afterEach(() => {
			clearConfirmMocks();
		});

		it("defers to `wrangler init` when no template is given", async () => {
			mockConfirm(
				{
					text: "Would you like to use git to manage this Worker?",
					result: false,
				},
				{
					text: "No package.json found. Would you like to create one?",
					result: false,
				}
			);
			await runWrangler("generate no-template");
			expect(std.out).toMatchInlineSnapshot(
				`"✨ Created no-template/wrangler.toml"`
			);
		});

		it("complains when given the --type argument", async () => {
			await expect(
				runWrangler("generate worker-name worker-template --type rust")
			).rejects.toThrowErrorMatchingInlineSnapshot(
				`"The --type option is no longer supported."`
			);
		});

		it("complains when given the --site argument", async () => {
			await expect(runWrangler("generate worker-name worker-template --site"))
				.rejects.toThrowErrorMatchingInlineSnapshot(`
					"The --site option is no longer supported.
					If you wish to create a brand new Worker Sites project then clone the \`worker-sites-template\` starter repository:

					\`\`\`
					git clone --depth=1 --branch=wrangler2 https://github.com/cloudflare/worker-sites-template worker-name
					cd worker-name
					\`\`\`

					Find out more about how to create and maintain Sites projects at https://developers.cloudflare.com/workers/platform/sites.
					Have you considered using Cloudflare Pages instead? See https://pages.cloudflare.com/."
				`);
		});

		it("auto-increments the worker directory name", async () => {
			fs.mkdirSync("my-worker");

			await expect(
				runWrangler("generate my-worker worker-typescript")
			).resolves.toBeUndefined();

			expect(fs.existsSync("my-worker-1")).toBe(true);

			await expect(
				runWrangler("generate my-worker worker-typescript")
			).resolves.toBeUndefined();

			expect(fs.existsSync("my-worker-2")).toBe(true);
		});
	});

	describe("cloning", () => {
		it("clones a given template", async () => {
			await expect(
				runWrangler("generate my-worker worker-typescript")
			).resolves.toBeUndefined();

			expect(fs.existsSync("my-worker")).toBe(true);
		});

		// TODO: more tests around cloning behavior
	});
});
