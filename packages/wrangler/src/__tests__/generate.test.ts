import fs from "node:fs";
import path from "node:path";
import { mockConsoleMethods } from "./helpers/mock-console";
import { mockConfirm } from "./helpers/mock-dialogs";
import { useMockIsTTY } from "./helpers/mock-istty";
import { runInTempDir } from "./helpers/run-in-tmp";
import { runWrangler } from "./helpers/run-wrangler";

const templates = {
	"worker-typescript": {
		".git": expect.any(Object),
		".gitignore": expect.any(String),
		"README.md": expect.stringContaining("Template: worker-typescript"),
		"package.json": expect.stringContaining("@cloudflare/workers-types"),
		src: expect.objectContaining({
			"index.ts": expect.any(String),
			"index.test.ts": expect.any(String),
		}),
		"tsconfig.json": expect.any(String),
		"wrangler.toml": expect.any(String),
	},
	"wrangler-generate-test-template": {
		".git": expect.any(Object),
		".gitignore": expect.any(String),
		"package.json": expect.stringContaining("@cloudflare/workers-types"),
		src: expect.objectContaining({ "index.ts": expect.any(String) }),
		"tsconfig.json": expect.any(String),
		"wrangler.toml": expect.any(String),
	},
	"worker-openapi": {
		".git": expect.any(Object),
		".gitignore": expect.any(String),
		"README.md": expect.stringContaining("Template: worker-openapi"),
		"package.json": expect.stringContaining("@cloudflare/workers-types"),
		src: expect.objectContaining({
			"index.ts": expect.any(String),
			"tasks.ts": expect.any(String),
		}),
		"tsconfig.json": expect.any(String),
		"wrangler.toml": expect.any(String),
	},
};
describe("generate", () => {
	runInTempDir();
	const { setIsTTY } = useMockIsTTY();
	const std = mockConsoleMethods();
	beforeEach(() => {
		setIsTTY(true);
	});

	describe("basic cli functionality", () => {
		afterEach(() => {});

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
	});

	describe.each([
		["worker-typescript", templates["worker-typescript"]],
		[
			"caass/wrangler-generate-test-template",
			templates["wrangler-generate-test-template"],
		],
		["cloudflare/templates/worker-typescript", templates["worker-typescript"]],
		[
			"https://github.com/caass/wrangler-generate-test-template",
			templates["wrangler-generate-test-template"],
		],
		[
			"https://github.com/cloudflare/templates/worker-typescript",
			templates["worker-typescript"],
		],
		[
			"https://github.com/cloudflare/templates/worker-openapi",
			templates["worker-openapi"],
		],
		["worker-openapi", templates["worker-openapi"]],
	])("cloning %s", (where: string, shape: Directory) => {
		it("auto-increments the worker directory name", async () => {
			fs.mkdirSync("my-worker");

			expect(fs.existsSync("my-worker-1")).toBe(false);

			await expect(
				runWrangler(`generate my-worker ${where}`)
			).resolves.toBeUndefined();

			expect(std.out).toStrictEqual(expect.stringContaining("my-worker-1"));

			expect(readDirectory("my-worker-1")).toMatchObject<Directory>(shape);
			expect(fs.existsSync("my-worker-2")).toBe(false);

			await expect(
				runWrangler(`generate my-worker ${where}`)
			).resolves.toBeUndefined();

			expect(std.out).toStrictEqual(expect.stringContaining("my-worker-2"));

			expect(readDirectory("my-worker-2")).toMatchObject<Directory>(shape);
		});
		it("clones a template with sparse checkouts", async () => {
			await expect(
				runWrangler(`generate my-worker ${where}`)
			).resolves.toBeUndefined();

			expect(readDirectory("my-worker")).toMatchObject<Directory>(shape);
		});

		// mocking out calls to either `isGitInstalled` or `execa("git", ["--version"])`
		// was harder than i thought, leaving this for now.
		it.todo("clones a cloudflare template with full checkouts");
	});
});

type FileName = string;
type FileContents = string;
type Directory = { [key: FileName]: FileContents | Directory };

function readDirectory(directoryPath: string): Directory {
	if (!fs.existsSync(directoryPath)) {
		throw new Error(`${directoryPath} does not exist!`);
	}

	if (!fs.lstatSync(directoryPath).isDirectory()) {
		throw new Error(`${directoryPath} is not a directory!`);
	}

	return fs
		.readdirSync(directoryPath, { withFileTypes: true })
		.reduce((output, child) => {
			const childPath = path.join(directoryPath, child.name);

			if (child.isDirectory()) {
				output[child.name] = readDirectory(childPath);
			} else if (child.isFile()) {
				output[child.name] = fs.readFileSync(childPath, { encoding: "utf-8" });
			} else {
				throw new Error(`${childPath} was not a file or directory!`);
			}

			return output;
		}, {} as Directory);
}
