import { runCommand } from "@cloudflare/cli-shared-helpers/command";
import { CancelError } from "@cloudflare/cli-shared-helpers/error";
import { inputPrompt } from "@cloudflare/cli-shared-helpers/interactive";
import { mockPackageManager, mockSpinner } from "helpers/__tests__/mocks";
import { readFile } from "helpers/files";
import { beforeEach, describe, test, vi } from "vitest";
import { usesCfCli } from "../cf/config";
import { getDeploymentUrl } from "../cf/deploy";
import { offerToDeploy, runDeploy } from "../deploy";
import { chooseAccount, login } from "../wrangler/accounts";
import { createTestContext } from "./helpers";

vi.mock("@cloudflare/cli-shared-helpers/command");
vi.mock("../cf/config");
vi.mock("../cf/deploy");
vi.mock("../wrangler/accounts");
vi.mock("@cloudflare/cli-shared-helpers/interactive");
vi.mock("which-pm-runs");
vi.mock("helpers/files");

const mockInsideGitRepo = (isInside = true) => {
	if (isInside) {
		vi.mocked(runCommand).mockResolvedValueOnce(
			"On branch master\nnothing to commit, working tree clean"
		);
	} else {
		vi.mocked(runCommand).mockRejectedValueOnce(
			new Error(
				"fatal: not a git repository (or any of the parent directories): .git"
			)
		);
	}
};

describe("deploy helpers", async () => {
	beforeEach(() => {
		mockPackageManager("npm");
		mockSpinner();
		vi.mocked(inputPrompt).mockImplementation(async (options) => {
			if (options.acceptDefault) {
				return options.defaultValue;
			}

			throw new Error(
				"If you don't want to accept the default, you must mock this function."
			);
		});
	});

	describe("offerToDeploy", async () => {
		test("user selects yes and succeeds", async ({ expect }) => {
			const ctx = createTestContext();
			ctx.template.platform = "pages";
			// mock the user selecting yes when asked to deploy
			vi.mocked(inputPrompt).mockResolvedValueOnce(true);
			// mock a successful wrangler login
			vi.mocked(login).mockResolvedValueOnce(true);

			await expect(offerToDeploy(ctx)).resolves.toBe(true);
		});

		test("project is undeployable (simple binding)", async ({ expect }) => {
			const ctx = createTestContext();
			// Can't deploy things with bindings (yet!)
			vi.mocked(readFile).mockReturnValue(`binding = "MY_QUEUE"`);

			await expect(offerToDeploy(ctx)).resolves.toBe(false);
			expect(inputPrompt).toHaveBeenCalledOnce();
			expect(ctx.args.deploy).toBe(false);
			expect(login).not.toHaveBeenCalled();
		});

		test("project is undeployable (complex binding)", async ({ expect }) => {
			const ctx = createTestContext();
			// Can't deploy things with bindings (yet!)
			vi.mocked(readFile).mockReturnValue(`
				assets = { directory = "./dist", binding = "ASSETS" }

				[[durable_objects.bindings]]
				name = "MY_DURABLE_OBJECT"
				class_name = "MyDurableObject"
			`);

			await expect(offerToDeploy(ctx)).resolves.toBe(false);
			expect(inputPrompt).toHaveBeenCalledOnce();
			expect(ctx.args.deploy).toBe(false);
			expect(login).not.toHaveBeenCalled();
		});

		test("assets project is deployable (no other bindings)", async ({
			expect,
		}) => {
			const ctx = createTestContext();
			vi.mocked(readFile).mockReturnValue(`
				assets = { directory = "./dist", binding = "ASSETS" }
			`);
			// mock the user selecting yes when asked to deploy
			vi.mocked(inputPrompt).mockResolvedValueOnce(true);
			// mock a successful wrangler login
			vi.mocked(login).mockResolvedValueOnce(true);

			await expect(offerToDeploy(ctx)).resolves.toBe(true);
			expect(inputPrompt).toHaveBeenCalledOnce();
			expect(ctx.args.deploy).toBe(true);
			expect(login).toHaveBeenCalled();
		});

		test("cf project is deployable without reading a Wrangler config", async ({
			expect,
		}) => {
			const ctx = createTestContext();
			vi.mocked(usesCfCli).mockReturnValue(true);
			vi.mocked(inputPrompt).mockResolvedValueOnce(true);
			vi.mocked(login).mockResolvedValueOnce(true);

			await expect(offerToDeploy(ctx)).resolves.toBe(true);
			expect(readFile).not.toHaveBeenCalled();
		});

		test("--no-deploy from command line", async ({ expect }) => {
			const ctx = createTestContext();
			ctx.args.deploy = false;
			ctx.template.platform = "pages";

			await expect(offerToDeploy(ctx)).resolves.toBe(false);
			expect(inputPrompt).toHaveBeenCalledOnce();
			expect(ctx.args.deploy).toBe(false);
			expect(login).not.toHaveBeenCalled();
		});

		test("wrangler login failure", async ({ expect }) => {
			const ctx = createTestContext();
			ctx.template.platform = "pages";
			vi.mocked(inputPrompt).mockResolvedValueOnce(true);
			vi.mocked(login).mockResolvedValueOnce(false);

			await expect(offerToDeploy(ctx)).resolves.toBe(false);
			expect(chooseAccount).not.toHaveBeenCalled();
		});
	});

	describe("runDeploy", async () => {
		const commitMsg = "initial commit";
		const deployedUrl = "https://test-project-1234.pages.dev";

		test("happy path", async ({ expect }) => {
			const ctx = createTestContext();
			ctx.account = { id: "test1234", name: "Test Account" };
			ctx.template.platform = "pages";
			ctx.commitMessage = commitMsg;
			mockInsideGitRepo(false);
			vi.mocked(runCommand).mockResolvedValueOnce("");
			vi.mocked(readFile).mockImplementationOnce(
				() => `{"type":"deploy", "targets":["${deployedUrl}"]}`
			);
			await runDeploy(ctx);
			expect(runCommand).toHaveBeenCalledWith(
				["npm", "run", "deploy", "--", "--commit-message", `"${commitMsg}"`],
				expect.any(Object)
			);
			expect(ctx.deployment.url).toBe(deployedUrl);
		});

		test("looks up the deployment url of cf projects", async ({ expect }) => {
			const ctx = createTestContext();
			ctx.account = { id: "test1234", name: "Test Account" };
			vi.mocked(usesCfCli).mockReturnValue(true);
			mockInsideGitRepo(false);
			vi.mocked(runCommand).mockResolvedValueOnce("");
			vi.mocked(getDeploymentUrl).mockResolvedValueOnce(
				"https://test.example.workers.dev"
			);

			await runDeploy(ctx);

			// The output isn't captured, so that `cf deploy` can prompt the user
			expect(runCommand).toHaveBeenLastCalledWith(
				["npm", "run", "deploy"],
				expect.not.objectContaining({ captureOutput: true })
			);
			expect(getDeploymentUrl).toHaveBeenCalledWith(
				ctx.project.path,
				"test1234"
			);
			expect(readFile).not.toHaveBeenCalled();
			expect(ctx.deployment.url).toBe("https://test.example.workers.dev");
		});

		test("cf project without a deployment url", async ({ expect }) => {
			const ctx = createTestContext();
			ctx.account = { id: "test1234", name: "Test Account" };
			vi.mocked(usesCfCli).mockReturnValue(true);
			mockInsideGitRepo(false);
			vi.mocked(runCommand).mockResolvedValueOnce("");
			vi.mocked(getDeploymentUrl).mockRejectedValueOnce(
				new Error("Failed to find deployment url: the reason why.")
			);

			// The reason that the lookup failed is reported to the user
			await expect(runDeploy(ctx)).rejects.toThrow(
				"Failed to find deployment url: the reason why."
			);
		});

		test("cancelled cf deployment url lookup", async ({ expect }) => {
			const ctx = createTestContext();
			ctx.account = { id: "test1234", name: "Test Account" };
			vi.mocked(usesCfCli).mockReturnValue(true);
			mockInsideGitRepo(false);
			vi.mocked(runCommand).mockResolvedValueOnce("");
			vi.mocked(getDeploymentUrl).mockRejectedValueOnce(
				new CancelError("Command cancelled")
			);

			await expect(runDeploy(ctx)).rejects.toThrow(CancelError);
		});

		test("no account in ctx", async ({ expect }) => {
			const ctx = createTestContext();
			ctx.account = undefined;
			await expect(() => runDeploy(ctx)).rejects.toThrow(
				"Failed to read Cloudflare account."
			);
		});

		test("Failed deployment", async ({ expect }) => {
			const ctx = createTestContext();
			ctx.account = { id: "test1234", name: "Test Account" };
			ctx.template.platform = "pages";
			ctx.commitMessage = commitMsg;
			mockInsideGitRepo(false);
			vi.mocked(runCommand).mockResolvedValueOnce("");

			await expect(() => runDeploy(ctx)).rejects.toThrow(
				"Failed to find deployment url."
			);
		});
	});
});
