import { http, HttpResponse } from "msw";
import { mockAccount } from "../cloudchamber/utils";
import { mockAccountId, mockApiToken } from "../helpers/mock-account-id";
import { mockCLIOutput, mockConsoleMethods } from "../helpers/mock-console";
import { clearDialogs, mockPrompt } from "../helpers/mock-dialogs";
import { useMockIsTTY } from "../helpers/mock-istty";
import { useMockStdin } from "../helpers/mock-stdin";
import { msw } from "../helpers/msw";
import { runWrangler } from "../helpers/run-wrangler";

describe("containers registry put", () => {
	const std = mockConsoleMethods();
	const { setIsTTY } = useMockIsTTY();
	const cliStd = mockCLIOutput();
	mockAccountId();
	mockApiToken();
	beforeEach(() => {
		mockAccount();
	});

	afterEach(() => {
		clearDialogs();
	});

	it("should not show in help", async () => {
		await runWrangler("containers --help");
		expect(std.out).toMatchInlineSnapshot(`
			"wrangler containers

			COMMANDS
			  wrangler containers build [PATH]  Build a container image
			  wrangler containers push [TAG]    Push a tagged image to a Cloudflare managed registry
			  wrangler containers images        Perform operations on images in your Cloudflare managed registry
			  wrangler containers info [ID]     Get information about a specific container
			  wrangler containers list          List containers
			  wrangler containers delete [ID]   Delete a container

			GLOBAL FLAGS
			  -c, --config    Path to Wrangler configuration file  [string]
			      --cwd       Run as if Wrangler was started in the specified directory instead of the current working directory  [string]
			  -e, --env       Environment to use for operations, and for selecting .env and .dev.vars files  [string]
			      --env-file  Path to an .env file to load - can be specified multiple times - values from earlier files are overridden by values in later files  [array]
			  -h, --help      Show help  [boolean]
			  -v, --version   Show version number  [boolean]"
		`);
	});

	it("should reject unsupported registry domains", async () => {
		await expect(runWrangler(`containers registry put docker.io`)).rejects
			.toThrowErrorMatchingInlineSnapshot(`
			[Error: docker.io is not a supported image registry.
			Currently we support the following non-Cloudflare registries: AWS ECR.]
		`);
	});

	it("should no-op on cloudflare registry (default)", async () => {
		await runWrangler(`containers registry put registry.cloudflare.com`);
		expect(cliStd.stdout).toMatchInlineSnapshot(`
			"╭ Configure container registry
			│
			│ Configuring Cloudflare Containers Managed Registry registry: registry.cloudflare.com
			│
			│ You do not need to configure credentials for Cloudflare managed registries.
			│
			╰ No configuration required

			"
		`);
	});

	describe("AWS ECR registry configuration", () => {
		it("should configure AWS ECR registry with interactive prompts", async () => {
			setIsTTY(true);
			const awsEcrDomain = "123456789012.dkr.ecr.us-west-2.amazonaws.com";

			// Mock the prompts for AWS credentials with exact message matching
			mockPrompt({
				text: "AWS_ACCESS_KEY_ID:",
				result: "test-access-key-id",
			});
			mockPrompt({
				text: "AWS_SECRET_ACCESS_KEY:",
				options: { isSecret: true },
				result: "test-secret-access-key",
			});
			mockPutRegistry();
			await expect(
				runWrangler(`containers registry put ${awsEcrDomain}`)
			).resolves.not.toThrow();
		});

		describe("non-interactive", () => {
			beforeEach(() => {
				setIsTTY(false);
			});
			const awsEcrDomain = "123456789012.dkr.ecr.us-west-2.amazonaws.com";
			const mockStdIn = useMockStdin({ isTTY: false });

			it("should accept valid JSON credentials from piped input", async () => {
				const validJson = JSON.stringify({
					AWS_ACCESS_KEY_ID: "AKIAIOSFODNN7EXAMPLE",
					AWS_SECRET_ACCESS_KEY: "wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY",
				});

				mockStdIn.send(validJson);
				mockPutRegistry();
				await runWrangler(`containers registry put ${awsEcrDomain}`);
			});

			it("should error with invalid JSON from piped input", async () => {
				const invalidJson = "not valid json";

				mockStdIn.send(invalidJson);
				await expect(runWrangler(`containers registry put ${awsEcrDomain}`))
					.rejects.toThrowErrorMatchingInlineSnapshot(`
				[Error: Invalid JSON input. Please provide AWS credentials in this format:
				{"AWS_ACCESS_KEY_ID":"your-access-key","AWS_SECRET_ACCESS_KEY":"your-secret-key"}]
			`);
			});

			it("should error with missing required credentials", async () => {
				const incompleteJson = JSON.stringify({
					AWS_ACCESS_KEY_ID: "AKIAIOSFODNN7EXAMPLE",
					// Missing AWS_SECRET_ACCESS_KEY
				});

				mockStdIn.send(incompleteJson);
				await expect(
					runWrangler(`containers registry put ${awsEcrDomain}`)
				).rejects.toThrowErrorMatchingInlineSnapshot(
					`[Error: Missing required credentials. JSON must include both AWS_ACCESS_KEY_ID and AWS_SECRET_ACCESS_KEY.]`
				);
			});

			it("should error with no piped input", async () => {
				mockStdIn.send("");
				await expect(runWrangler(`containers registry put ${awsEcrDomain}`))
					.rejects.toThrowErrorMatchingInlineSnapshot(`
				[Error: No input provided. In non-interactive mode, please pipe AWS credentials as JSON:
				echo '{"AWS_ACCESS_KEY_ID":"...","AWS_SECRET_ACCESS_KEY":"..."}' | wrangler containers registry put 123456789012.dkr.ecr.us-west-2.amazonaws.com]
			`);
			});
		});
	});
});

const mockPutRegistry = () => {
	msw.use(
		http.post("*/accounts/:accountId/containers/registries", async () => {
			return HttpResponse.json({ success: true });
		})
	);
};
