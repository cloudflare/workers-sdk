import { writeFileSync } from "node:fs";
import { runInTempDir } from "@cloudflare/workers-utils/test-helpers";
import { http, HttpResponse } from "msw";
import { afterEach, beforeEach, describe, it, vi } from "vitest";
import { mockAccount } from "../cloudchamber/utils";
import { mockAccountId, mockApiToken } from "../helpers/mock-account-id";
import { mockCLIOutput } from "../helpers/mock-cli-output";
import { mockConsoleMethods } from "../helpers/mock-console";
import { clearDialogs, mockConfirm, mockPrompt } from "../helpers/mock-dialogs";
import { useMockIsTTY } from "../helpers/mock-istty";
import {
	mockCreateSecret,
	mockCreateSecretStore,
	mockDeleteSecret,
	mockListSecrets,
	mockListSecretStores,
} from "../helpers/mock-secrets-store";
import { useMockStdin } from "../helpers/mock-stdin";
import { createFetchResult, msw } from "../helpers/msw";
import { runWrangler } from "../helpers/run-wrangler";
import type { ExpectStatic } from "vitest";

describe("containers registries --help", () => {
	const std = mockConsoleMethods();

	it("should help", async ({ expect }) => {
		await runWrangler("containers registries --help");
		expect(std.out).toMatchInlineSnapshot(`
			"wrangler containers registries

			Configure and manage non-Cloudflare registries

			COMMANDS
			  wrangler containers registries configure <DOMAIN>    Configure credentials for a non-Cloudflare container registry
			  wrangler containers registries list                  List all configured container registries
			  wrangler containers registries delete <DOMAIN>       Delete a configured container registry
			  wrangler containers registries credentials [DOMAIN]  Get a temporary password for a specific domain

			GLOBAL FLAGS
			  -c, --config          Path to Wrangler configuration file  [string]
			      --cwd             Run as if Wrangler was started in the specified directory instead of the current working directory  [string]
			  -e, --env             Environment to use for operations, and for selecting .env and .dev.vars files  [string]
			      --env-file        Path to an .env file to load - can be specified multiple times - values from earlier files are overridden by values in later files  [array]
			  -h, --help            Show help  [boolean]
			      --install-skills  Install Cloudflare skills for detected AI coding agents before running the command  [boolean] [default: false]
			      --profile         Use a specific auth profile  [string]
			  -v, --version         Show version number  [boolean]"
		`);
	});
});

describe("containers registries configure", () => {
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

	it("should not show beta labels in top level help", async ({ expect }) => {
		await runWrangler("containers --help");
		expect(std.out).toContain("📦 Manage Containers");
		expect(std.out).not.toContain("[open beta]");
	});

	it("should reject unsupported registry domains", async ({ expect }) => {
		await expect(
			runWrangler(
				`containers registries configure unsupported.domain --public-credential=test-id`
			)
		).rejects.toThrowErrorMatchingInlineSnapshot(`
			[Error: unsupported.domain is not a supported image registry.
			Currently we support the following non-Cloudflare registries: AWS ECR, DockerHub, Google Artifact Registry.
			To use an existing image from another repository, see https://developers.cloudflare.com/containers/platform-details/image-management/#using-pre-built-container-images]
		`);
	});

	it("should validate command line arguments for Secrets Store", async ({
		expect,
	}) => {
		const domain = "123456789012.dkr.ecr.us-west-2.amazonaws.com";
		await expect(
			runWrangler(
				`containers registries configure ${domain} --public-credential=test-id --disable-secrets-store`
			)
		).rejects.toThrowErrorMatchingInlineSnapshot(
			`[Error: Secrets Store can only be disabled in FedRAMP compliance regions.]`
		);

		// Set compliance region to FedRAMP High
		vi.stubEnv("CLOUDFLARE_COMPLIANCE_REGION", "fedramp_high");
		await expect(
			runWrangler(
				`containers registries configure ${domain} --aws-access-key-id=test-access-key-id --secret-store-id=storeid`
			)
		).rejects.toThrowErrorMatchingInlineSnapshot(
			`[Error: Secrets Store is not supported in FedRAMP compliance regions. You must set --disable-secrets-store.]`
		);

		await expect(
			runWrangler(
				`containers registries configure ${domain} --aws-access-key-id=test-access-key-id --secret-store-id=storeid --disable-secrets-store`
			)
		).rejects.toThrowErrorMatchingInlineSnapshot(
			`[Error: Arguments secret-store-id and disable-secrets-store are mutually exclusive]`
		);

		await expect(
			runWrangler(
				`containers registries configure ${domain} --aws-access-key-id=test-access-key-id --secret-name=secret-name --disable-secrets-store`
			)
		).rejects.toThrowErrorMatchingInlineSnapshot(
			`[Error: Arguments secret-name and disable-secrets-store are mutually exclusive]`
		);
	});

	it("should enforce mutual exclusivity for public credential arguments", async ({
		expect,
	}) => {
		await expect(
			runWrangler(`containers registries configure docker.io`)
		).rejects.toThrowErrorMatchingInlineSnapshot(
			`[Error: Missing required argument: dockerhub-username]`
		);

		await expect(
			runWrangler(
				`containers registries configure 123456789012.dkr.ecr.region.amazonaws.com`
			)
		).rejects.toThrowErrorMatchingInlineSnapshot(
			`[Error: Missing required argument: aws-access-key-id]`
		);

		await expect(
			runWrangler(
				`containers registries configure docker.io --public-credential=test-id --dockerhub-username=another-test-id`
			)
		).rejects.toThrowErrorMatchingInlineSnapshot(
			`[Error: Arguments public-credential and dockerhub-username are mutually exclusive]`
		);

		await expect(
			runWrangler(
				`containers registries configure us-central1-docker.pkg.dev --gar-email=test@example.com --aws-access-key-id=test-id`
			)
		).rejects.toThrowErrorMatchingInlineSnapshot(
			`[Error: Arguments gar-email and aws-access-key-id are mutually exclusive]`
		);
	});

	it("should reject provider-specific credential flags used with the wrong registry", async ({
		expect,
	}) => {
		await expect(
			runWrangler(
				`containers registries configure docker.io --gar-email=test@example.com`
			)
		).rejects.toThrowErrorMatchingInlineSnapshot(
			`[Error: --gar-email can only be used with Google Artifact Registry.]`
		);

		await expect(
			runWrangler(
				`containers registries configure us-central1-docker.pkg.dev --dockerhub-username=cloudchambertest`
			)
		).rejects.toThrowErrorMatchingInlineSnapshot(
			`[Error: --dockerhub-username can only be used with DockerHub.]`
		);
	});

	it("should no-op on cloudflare registry (default)", async ({ expect }) => {
		await runWrangler(
			`containers registries configure registry.cloudflare.com`
		);
		expect(cliStd.stdout).toMatchInlineSnapshot(`
			"╭ Configure a container registry
			│
			│ You do not need to configure credentials for Cloudflare managed registries.
			│
			╰ No configuration required

			"
		`);
	});

	describe("FedRAMP compliance region", () => {
		beforeEach(() => {
			vi.stubEnv("CLOUDFLARE_COMPLIANCE_REGION", "fedramp_high");
		});

		it("should configure AWS ECR registry with interactive prompts", async ({
			expect,
		}) => {
			setIsTTY(true);
			const awsEcrDomain = "123456789012.dkr.ecr.us-west-2.amazonaws.com";
			mockPrompt({
				text: "Enter AWS Secret Access Key:",
				options: { isSecret: true },
				result: "test-secret-access-key",
			});

			mockPutRegistry(expect, {
				domain: "123456789012.dkr.ecr.us-west-2.amazonaws.com",
				is_public: false,
				auth: {
					public_credential: "test-access-key-id",
					private_credential: "test-secret-access-key",
				},
				kind: "ECR",
			});

			await runWrangler(
				`containers registries configure ${awsEcrDomain} --aws-access-key-id=test-access-key-id --disable-secrets-store`
			);

			expect(cliStd.stdout).toMatchInlineSnapshot(`
				"╭ Configure a container registry
				│
				│ Configuring AWS ECR registry: 123456789012.dkr.ecr.us-west-2.amazonaws.com
				│
				│ Getting AWS Secret Access Key...
				│
				╰ Registry configuration completed

				"
			`);
		});

		describe("non-interactive", () => {
			beforeEach(() => {
				setIsTTY(false);
			});
			const awsEcrDomain = "123456789012.dkr.ecr.us-west-2.amazonaws.com";
			const mockStdIn = useMockStdin({ isTTY: false });

			it("should accept the secret from piped input", async ({ expect }) => {
				const secret = "wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY";

				mockStdIn.send(secret);
				mockPutRegistry(expect, {
					domain: awsEcrDomain,
					is_public: false,
					auth: {
						public_credential: "test-access-key-id",
						private_credential: "wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY",
					},
					kind: "ECR",
				});

				await runWrangler(
					`containers registries configure ${awsEcrDomain} --public-credential=test-access-key-id --disable-secrets-store`
				);
			});
		});
	});

	describe("AWS ECR registry configuration", () => {
		it("should configure AWS ECR registry with interactive prompts", async ({
			expect,
		}) => {
			setIsTTY(true);
			const awsEcrDomain = "123456789012.dkr.ecr.us-west-2.amazonaws.com";
			const storeId = "test-store-id-123";
			mockPrompt({
				text: "Secret name:",
				options: { isSecret: false, defaultValue: "AWS_Secret_Access_Key" },
				result: "AWS_Secret_Access_Key",
			});
			mockPrompt({
				text: "Enter AWS Secret Access Key:",
				options: { isSecret: true },
				result: "test-secret-access-key",
			});

			mockListSecretStores([
				{
					id: storeId,
					account_id: "some-account-id",
					name: "Default",
					created: "2024-01-01T00:00:00Z",
					modified: "2024-01-01T00:00:00Z",
				},
			]);
			mockListSecrets(storeId, []);
			mockCreateSecret(storeId);
			mockPutRegistry(expect, {
				domain: "123456789012.dkr.ecr.us-west-2.amazonaws.com",
				is_public: false,
				auth: {
					public_credential: "test-access-key-id",
					private_credential: {
						store_id: storeId,
						secret_name: "AWS_Secret_Access_Key",
					},
				},
				kind: "ECR",
			});

			await runWrangler(
				`containers registries configure ${awsEcrDomain} --aws-access-key-id=test-access-key-id`
			);

			expect(cliStd.stdout).toContain("Using existing Secret Store Default");
		});

		it("will create a secret store if no existing stores are returned from the api", async ({
			expect,
		}) => {
			setIsTTY(true);
			const awsEcrDomain = "123456789012.dkr.ecr.us-west-2.amazonaws.com";
			const newStoreId = "new-store-id-456";

			mockConfirm({
				text: "No existing Secret Stores found. Create a Secret Store to store your registry credentials?",
				result: true,
			});
			mockPrompt({
				text: "Secret name:",
				options: { isSecret: false, defaultValue: "AWS_Secret_Access_Key" },
				result: "AWS_Secret_Access_Key",
			});
			mockPrompt({
				text: "Enter AWS Secret Access Key:",
				options: { isSecret: true },
				result: "test-secret-access-key",
			});

			mockListSecretStores([]);
			mockCreateSecretStore(newStoreId);
			mockListSecrets(newStoreId, []);
			mockCreateSecret(newStoreId);
			mockPutRegistry(expect, {
				domain: awsEcrDomain,
				is_public: false,
				auth: {
					public_credential: "test-access-key-id",
					private_credential: {
						store_id: newStoreId,
						secret_name: "AWS_Secret_Access_Key",
					},
				},
				kind: "ECR",
			});

			await expect(
				runWrangler(
					`containers registries configure ${awsEcrDomain} --aws-access-key-id=test-access-key-id`
				)
			).resolves.not.toThrow();
			expect(cliStd.stdout).toContain(
				`New Secret Store default_secret_store created with id: ${newStoreId}`
			);
		});

		it("will use an existing secret store if a store id is provided", async ({
			expect,
		}) => {
			setIsTTY(true);
			const awsEcrDomain = "123456789012.dkr.ecr.us-west-2.amazonaws.com";
			const providedStoreId = "provided-store-id-789";

			mockPrompt({
				text: "Secret name:",
				options: { isSecret: false, defaultValue: "AWS_Secret_Access_Key" },
				result: "AWS_Secret_Access_Key",
			});
			mockPrompt({
				text: "Enter AWS Secret Access Key:",
				options: { isSecret: true },
				result: "test-secret-access-key",
			});

			mockListSecrets(providedStoreId, []);
			mockCreateSecret(providedStoreId);
			mockPutRegistry(expect, {
				domain: awsEcrDomain,
				is_public: false,
				auth: {
					public_credential: "test-access-key-id",
					private_credential: {
						store_id: providedStoreId,
						secret_name: "AWS_Secret_Access_Key",
					},
				},
				kind: "ECR",
			});

			await expect(
				runWrangler(
					`containers registries configure ${awsEcrDomain} --aws-access-key-id=test-access-key-id --secret-store-id=${providedStoreId}`
				)
			).resolves.not.toThrow();
			// Should not call listStores or createStore
			expect(cliStd.stdout).toMatchInlineSnapshot(`
				"╭ Configure a container registry
				│
				│ Configuring AWS ECR registry: 123456789012.dkr.ecr.us-west-2.amazonaws.com
				│
				│
				│ Setting up integration with Secrets Store...
				│
				│
				│
				│ Getting AWS Secret Access Key...
				│
				│ Container-scoped secret "AWS_Secret_Access_Key" created in Secrets Store.
				│
				╰ Registry configuration completed

				"
			`);
		});

		it("should reuse an existing secret interactively without prompting for the credential", async ({
			expect,
		}) => {
			setIsTTY(true);
			const awsEcrDomain = "123456789012.dkr.ecr.us-west-2.amazonaws.com";
			const providedStoreId = "provided-store-id-reuse";
			const secretName = "existing_secret";

			mockConfirm({
				text: "Do you want to reuse the existing secret? If not, then you'll be prompted to pick a new name.",
				result: true,
			});

			mockListSecrets(providedStoreId, [
				{
					id: "existing-secret-id",
					store_id: providedStoreId,
					name: secretName,
					comment: "",
					scopes: ["containers"],
					created: "2024-01-01T00:00:00Z",
					modified: "2024-01-01T00:00:00Z",
					status: "active",
				},
			]);
			mockPutRegistry(expect, {
				domain: awsEcrDomain,
				is_public: false,
				auth: {
					public_credential: "test-access-key-id",
					private_credential: {
						store_id: providedStoreId,
						secret_name: secretName,
					},
				},
				kind: "ECR",
			});

			await runWrangler(
				`containers registries configure ${awsEcrDomain} --aws-access-key-id=test-access-key-id --secret-store-id=${providedStoreId} --secret-name=${secretName}`
			);

			expect(cliStd.stdout).not.toContain("created in Secrets Store");
		});

		describe("non-interactive", () => {
			beforeEach(() => {
				setIsTTY(false);
			});
			const awsEcrDomain = "123456789012.dkr.ecr.us-west-2.amazonaws.com";
			const mockStdIn = useMockStdin({ isTTY: false });

			it("should accept the secret from piped input", async ({ expect }) => {
				const secret = "wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY";
				const storeId = "test-store-id-999";

				mockStdIn.send(secret);
				mockListSecretStores([
					{
						id: storeId,
						account_id: "some-account-id",
						name: "Default",
						created: "2024-01-01T00:00:00Z",
						modified: "2024-01-01T00:00:00Z",
					},
				]);
				mockListSecrets(storeId, []);
				mockCreateSecret(storeId);
				mockPutRegistry(expect, {
					domain: awsEcrDomain,
					is_public: false,
					auth: {
						public_credential: "test-access-key-id",
						private_credential: {
							store_id: storeId,
							secret_name: "AWS_Secret_Access_Key",
						},
					},
					kind: "ECR",
				});
				await runWrangler(
					`containers registries configure ${awsEcrDomain} --public-credential=test-access-key-id --secret-name=AWS_Secret_Access_Key`
				);
			});

			it("should ignore a piped stdin value when reusing an existing secret with --skip-confirmation", async ({
				expect,
			}) => {
				const storeId = "test-store-id-reuse";
				const secretName = "existing_secret";

				mockStdIn.send("test-secret-value");
				mockListSecretStores([
					{
						id: storeId,
						account_id: "some-account-id",
						name: "Default",
						created: "2024-01-01T00:00:00Z",
						modified: "2024-01-01T00:00:00Z",
					},
				]);
				mockListSecrets(storeId, [
					{
						id: "existing-secret-id",
						store_id: storeId,
						name: secretName,
						comment: "",
						scopes: ["containers"],
						created: "2024-01-01T00:00:00Z",
						modified: "2024-01-01T00:00:00Z",
						status: "active",
					},
				]);
				mockPutRegistry(expect, {
					domain: awsEcrDomain,
					is_public: false,
					auth: {
						public_credential: "test-access-key-id",
						private_credential: {
							store_id: storeId,
							secret_name: secretName,
						},
					},
					kind: "ECR",
				});

				await runWrangler(
					`containers registries configure ${awsEcrDomain} --public-credential=test-access-key-id --secret-name=${secretName} --skip-confirmation`
				);

				// Should not contain "created" message since we reused existing secret
				expect(cliStd.stdout).not.toContain("created in Secrets Store");
			});

			it("should reuse existing secret without requiring a value (no stdin)", async ({
				expect,
			}) => {
				const storeId = "test-store-id-reuse";
				const secretName = "existing_secret";

				mockListSecretStores([
					{
						id: storeId,
						account_id: "some-account-id",
						name: "Default",
						created: "2024-01-01T00:00:00Z",
						modified: "2024-01-01T00:00:00Z",
					},
				]);
				mockListSecrets(storeId, [
					{
						id: "existing-secret-id",
						store_id: storeId,
						name: secretName,
						comment: "",
						scopes: ["containers"],
						created: "2024-01-01T00:00:00Z",
						modified: "2024-01-01T00:00:00Z",
						status: "active",
					},
				]);
				mockPutRegistry(expect, {
					domain: awsEcrDomain,
					is_public: false,
					auth: {
						public_credential: "test-access-key-id",
						private_credential: {
							store_id: storeId,
							secret_name: secretName,
						},
					},
					kind: "ECR",
				});

				await runWrangler(
					`containers registries configure ${awsEcrDomain} --public-credential=test-access-key-id --secret-name=${secretName} --skip-confirmation`
				);

				expect(cliStd.stdout).not.toContain("created in Secrets Store");
			});
		});
	});

	describe("DockerHub registry configuration", () => {
		it("should configure DockerHub registry with interactive prompts", async ({
			expect,
		}) => {
			setIsTTY(true);
			const dockerHubDomain = "docker.io";
			const storeId = "test-store-id-123";
			mockPrompt({
				text: "Secret name:",
				options: { isSecret: false, defaultValue: "DockerHub_PAT_Token" },
				result: "DockerHub_PAT_Token",
			});
			mockPrompt({
				text: "Enter DockerHub PAT Token:",
				options: { isSecret: true },
				result: "test-pat-token",
			});

			mockListSecretStores([
				{
					id: storeId,
					account_id: "some-account-id",
					name: "Default",
					created: "2024-01-01T00:00:00Z",
					modified: "2024-01-01T00:00:00Z",
				},
			]);
			mockListSecrets(storeId, []);
			mockCreateSecret(storeId);
			mockPutRegistry(expect, {
				domain: "docker.io",
				is_public: false,
				auth: {
					public_credential: "cloudchambertest",
					private_credential: {
						store_id: storeId,
						secret_name: "DockerHub_PAT_Token",
					},
				},
				kind: "DockerHub",
			});

			await runWrangler(
				`containers registries configure ${dockerHubDomain} --dockerhub-username=cloudchambertest`
			);

			expect(cliStd.stdout).toContain("Using existing Secret Store Default");
		});

		describe("non-interactive", () => {
			beforeEach(() => {
				setIsTTY(false);
			});
			const dockerHubDomain = "docker.io";
			const mockStdIn = useMockStdin({ isTTY: false });

			it("should accept the secret from piped input", async ({ expect }) => {
				const secret = "example-pat-token";
				const storeId = "test-store-id-999";

				mockStdIn.send(secret);
				mockListSecretStores([
					{
						id: storeId,
						account_id: "some-account-id",
						name: "Default",
						created: "2024-01-01T00:00:00Z",
						modified: "2024-01-01T00:00:00Z",
					},
				]);
				mockListSecrets(storeId, []);
				mockCreateSecret(storeId);
				mockPutRegistry(expect, {
					domain: dockerHubDomain,
					is_public: false,
					auth: {
						public_credential: "cloudchambertest",
						private_credential: {
							store_id: storeId,
							secret_name: "DockerHub_PAT_Token",
						},
					},
					kind: "DockerHub",
				});
				await runWrangler(
					`containers registries configure ${dockerHubDomain} --public-credential=cloudchambertest --secret-name=DockerHub_PAT_Token`
				);
			});

			it("should reuse existing secret without requiring a value (no stdin)", async ({
				expect,
			}) => {
				const storeId = "test-store-id-reuse";
				const secretName = "existing_secret";

				// No value is piped via stdin; the existing secret is reused by reference.
				mockListSecretStores([
					{
						id: storeId,
						account_id: "some-account-id",
						name: "Default",
						created: "2024-01-01T00:00:00Z",
						modified: "2024-01-01T00:00:00Z",
					},
				]);
				mockListSecrets(storeId, [
					{
						id: "existing-secret-id",
						store_id: storeId,
						name: secretName,
						comment: "",
						scopes: ["containers"],
						created: "2024-01-01T00:00:00Z",
						modified: "2024-01-01T00:00:00Z",
						status: "active",
					},
				]);
				mockPutRegistry(expect, {
					domain: dockerHubDomain,
					is_public: false,
					auth: {
						public_credential: "cloudchambertest",
						private_credential: {
							store_id: storeId,
							secret_name: secretName,
						},
					},
					kind: "DockerHub",
				});

				await runWrangler(
					`containers registries configure ${dockerHubDomain} --public-credential=cloudchambertest --secret-name=${secretName} --skip-confirmation`
				);

				expect(cliStd.stdout).not.toContain("created in Secrets Store");
			});
		});
	});

	describe("Google Artifact Registry configuration", () => {
		runInTempDir();
		const garDomain = "us-central1-docker.pkg.dev";
		const garEmail = "wrangler-test@test-project.iam.gserviceaccount.com";
		const serviceAccountKey = JSON.stringify({
			type: "service_account",
			project_id: "test-project",
			private_key_id: "test-key-id",
			private_key: "fake-private-key",
			client_email: garEmail,
			client_id: "123456789",
		});
		const base64Key = Buffer.from(serviceAccountKey, "utf8").toString("base64");

		describe("interactive", () => {
			beforeEach(() => {
				setIsTTY(true);
			});

			it("should configure GAR with a key file path", async ({ expect }) => {
				const storeId = "test-store-id-gar";
				writeFileSync("gar-key.json", serviceAccountKey);
				// Existence-first: the secret name is resolved before the key is read.
				mockPrompt({
					text: "Secret name:",
					options: {
						isSecret: false,
						defaultValue: "Google_Service_Account_JSON_Key",
					},
					result: "Google_Service_Account_JSON_Key",
				});
				mockPrompt({
					text: "Enter Google Service Account JSON Key (file path or base64):",
					options: { isSecret: true },
					result: "gar-key.json",
				});

				mockListSecretStores([
					{
						id: storeId,
						account_id: "some-account-id",
						name: "Default",
						created: "2024-01-01T00:00:00Z",
						modified: "2024-01-01T00:00:00Z",
					},
				]);
				mockListSecrets(storeId, []);
				mockCreateSecret(storeId);
				mockPutRegistry(expect, {
					domain: garDomain,
					is_public: false,
					auth: {
						public_credential: garEmail,
						private_credential: {
							store_id: storeId,
							secret_name: "Google_Service_Account_JSON_Key",
						},
					},
					kind: "GAR",
				});

				await runWrangler(
					`containers registries configure ${garDomain} --gar-email=${garEmail}`
				);

				expect(cliStd.stdout).toContain("Using existing Secret Store Default");
			});

			it("should configure GAR with base64 key contents", async ({
				expect,
			}) => {
				const storeId = "test-store-id-gar";
				mockPrompt({
					text: "Secret name:",
					options: {
						isSecret: false,
						defaultValue: "Google_Service_Account_JSON_Key",
					},
					result: "Google_Service_Account_JSON_Key",
				});
				mockPrompt({
					text: "Enter Google Service Account JSON Key (file path or base64):",
					options: { isSecret: true },
					result: base64Key,
				});

				mockListSecretStores([
					{
						id: storeId,
						account_id: "some-account-id",
						name: "Default",
						created: "2024-01-01T00:00:00Z",
						modified: "2024-01-01T00:00:00Z",
					},
				]);
				mockListSecrets(storeId, []);
				mockCreateSecret(storeId);
				mockPutRegistry(expect, {
					domain: garDomain,
					is_public: false,
					auth: {
						public_credential: garEmail,
						private_credential: {
							store_id: storeId,
							secret_name: "Google_Service_Account_JSON_Key",
						},
					},
					kind: "GAR",
				});

				await runWrangler(
					`containers registries configure ${garDomain} --gar-email=${garEmail}`
				);

				expect(cliStd.stdout).toContain("Using existing Secret Store Default");
			});

			it("should reuse an existing secret without prompting for the key", async ({
				expect,
			}) => {
				const providedStoreId = "provided-store-id-gar-reuse";
				const secretName = "existing_gar_secret";

				mockConfirm({
					text: "Do you want to reuse the existing secret? If not, then you'll be prompted to pick a new name.",
					result: true,
				});
				mockListSecrets(providedStoreId, [
					{
						id: "existing-secret-id",
						store_id: providedStoreId,
						name: secretName,
						comment: "",
						scopes: ["containers"],
						created: "2024-01-01T00:00:00Z",
						modified: "2024-01-01T00:00:00Z",
						status: "active",
					},
				]);
				mockPutRegistry(expect, {
					domain: garDomain,
					is_public: false,
					auth: {
						public_credential: garEmail,
						private_credential: {
							store_id: providedStoreId,
							secret_name: secretName,
						},
					},
					kind: "GAR",
				});

				await runWrangler(
					`containers registries configure ${garDomain} --gar-email=${garEmail} --secret-store-id=${providedStoreId} --secret-name=${secretName}`
				);

				expect(cliStd.stdout).not.toContain("created in Secrets Store");
				expect(cliStd.stdout).toContain(
					"Wrangler cannot verify it matches --gar-email"
				);
			});
		});

		describe("non-interactive", () => {
			beforeEach(() => {
				setIsTTY(false);
			});
			const mockStdIn = useMockStdin({ isTTY: false });

			it("should accept the key from piped stdin when --gar-email matches", async ({
				expect,
			}) => {
				const storeId = "test-store-id-gar";
				mockStdIn.send(serviceAccountKey);
				mockListSecretStores([
					{
						id: storeId,
						account_id: "some-account-id",
						name: "Default",
						created: "2024-01-01T00:00:00Z",
						modified: "2024-01-01T00:00:00Z",
					},
				]);
				mockListSecrets(storeId, []);
				mockCreateSecret(storeId);
				mockPutRegistry(expect, {
					domain: garDomain,
					is_public: false,
					auth: {
						public_credential: garEmail,
						private_credential: {
							store_id: storeId,
							secret_name: "Google_Service_Account_JSON_Key",
						},
					},
					kind: "GAR",
				});

				await runWrangler(
					`containers registries configure ${garDomain} --gar-email=${garEmail} --secret-name=Google_Service_Account_JSON_Key`
				);
			});

			it("should reject when --gar-email does not match the key", async ({
				expect,
			}) => {
				const storeId = "test-store-id-gar";
				mockStdIn.send(serviceAccountKey);
				mockListSecretStores([
					{
						id: storeId,
						account_id: "some-account-id",
						name: "Default",
						created: "2024-01-01T00:00:00Z",
						modified: "2024-01-01T00:00:00Z",
					},
				]);
				mockListSecrets(storeId, []);

				await expect(
					runWrangler(
						`containers registries configure ${garDomain} --gar-email=wrong@example.com --secret-name=Google_Service_Account_JSON_Key`
					)
				).rejects.toThrowErrorMatchingInlineSnapshot(
					`[Error: The provided --gar-email "wrong@example.com" does not match the service account email "wrangler-test@test-project.iam.gserviceaccount.com" in the key.]`
				);
			});

			it("should reuse an existing secret without requiring the key (with warning)", async ({
				expect,
			}) => {
				const storeId = "test-store-id-gar";
				const secretName = "existing_gar_secret";
				// No key is piped: the existing secret is reused by reference.
				mockListSecretStores([
					{
						id: storeId,
						account_id: "some-account-id",
						name: "Default",
						created: "2024-01-01T00:00:00Z",
						modified: "2024-01-01T00:00:00Z",
					},
				]);
				mockListSecrets(storeId, [
					{
						id: "existing-secret-id",
						store_id: storeId,
						name: secretName,
						comment: "",
						scopes: ["containers"],
						created: "2024-01-01T00:00:00Z",
						modified: "2024-01-01T00:00:00Z",
						status: "active",
					},
				]);
				mockPutRegistry(expect, {
					domain: garDomain,
					is_public: false,
					auth: {
						public_credential: garEmail,
						private_credential: {
							store_id: storeId,
							secret_name: secretName,
						},
					},
					kind: "GAR",
				});

				await runWrangler(
					`containers registries configure ${garDomain} --gar-email=${garEmail} --secret-name=${secretName} --skip-confirmation`
				);

				expect(cliStd.stdout).not.toContain("created in Secrets Store");
				expect(cliStd.stdout).toContain(
					"Wrangler cannot verify it matches --gar-email"
				);
			});

			it("should ignore a piped key when reusing an existing secret", async ({
				expect,
			}) => {
				const storeId = "test-store-id-gar";
				const secretName = "existing_gar_secret";

				mockStdIn.send(serviceAccountKey);
				mockListSecretStores([
					{
						id: storeId,
						account_id: "some-account-id",
						name: "Default",
						created: "2024-01-01T00:00:00Z",
						modified: "2024-01-01T00:00:00Z",
					},
				]);
				mockListSecrets(storeId, [
					{
						id: "existing-secret-id",
						store_id: storeId,
						name: secretName,
						comment: "",
						scopes: ["containers"],
						created: "2024-01-01T00:00:00Z",
						modified: "2024-01-01T00:00:00Z",
						status: "active",
					},
				]);
				mockPutRegistry(expect, {
					domain: garDomain,
					is_public: false,
					auth: {
						public_credential: "different@example.com",
						private_credential: {
							store_id: storeId,
							secret_name: secretName,
						},
					},
					kind: "GAR",
				});

				await runWrangler(
					`containers registries configure ${garDomain} --gar-email=different@example.com --secret-name=${secretName} --skip-confirmation`
				);

				expect(cliStd.stdout).not.toContain("created in Secrets Store");
				expect(cliStd.stdout).toContain(
					"Wrangler cannot verify it matches --gar-email"
				);
			});

			it("should require --gar-email", async ({ expect }) => {
				await expect(
					runWrangler(`containers registries configure ${garDomain}`)
				).rejects.toThrowErrorMatchingInlineSnapshot(
					`[Error: Missing required argument: gar-email]`
				);
			});
		});

		describe("FedRAMP compliance region", () => {
			beforeEach(() => {
				vi.stubEnv("CLOUDFLARE_COMPLIANCE_REGION", "fedramp_high");
				setIsTTY(false);
			});
			const mockStdIn = useMockStdin({ isTTY: false });

			it("should validate and encode the key inline when --gar-email matches", async ({
				expect,
			}) => {
				mockStdIn.send(serviceAccountKey);
				mockPutRegistry(expect, {
					domain: garDomain,
					is_public: false,
					auth: {
						public_credential: garEmail,
						private_credential: base64Key,
					},
					kind: "GAR",
				});

				await runWrangler(
					`containers registries configure ${garDomain} --gar-email=${garEmail} --disable-secrets-store`
				);
			});

			it("should reject inline when --gar-email does not match the key", async ({
				expect,
			}) => {
				mockStdIn.send(serviceAccountKey);

				await expect(
					runWrangler(
						`containers registries configure ${garDomain} --gar-email=wrong@example.com --disable-secrets-store`
					)
				).rejects.toThrowErrorMatchingInlineSnapshot(
					`[Error: The provided --gar-email "wrong@example.com" does not match the service account email "wrangler-test@test-project.iam.gserviceaccount.com" in the key.]`
				);
			});
		});
	});
});

describe("containers registries list", () => {
	const std = mockConsoleMethods();
	const cliStd = mockCLIOutput();
	mockAccountId();
	mockApiToken();
	const { setIsTTY } = useMockIsTTY();
	beforeEach(() => {
		setIsTTY(true);
		mockAccount();
	});

	it("should list empty registries", async ({ expect }) => {
		mockListRegistries([]);
		await runWrangler("containers registries list");
		expect(cliStd.stdout).toMatchInlineSnapshot(`
			"╭ List configured container registries
			│
			╰ No registries configured for this account

			"
		`);
	});

	it("should list configured registries", async ({ expect }) => {
		const mockRegistries = [
			{ domain: "123456789012.dkr.ecr.us-west-2.amazonaws.com" },
			{ domain: "987654321098.dkr.ecr.eu-west-1.amazonaws.com" },
		];
		mockListRegistries(mockRegistries);
		await runWrangler("containers registries list");
		expect(std.out).toMatchInlineSnapshot(`
			"
			 ⛅️ wrangler x.x.x
			──────────────────"
		`);
		expect(cliStd.stdout).toMatchInlineSnapshot(`
			"╭ List configured container registries
			│
			├ 123456789012.dkr.ecr.us-west-2.amazonaws.com
			│
			├ 987654321098.dkr.ecr.eu-west-1.amazonaws.com
			│
			╰ End

			"
		`);
	});

	it("should output valid JSON when --json flag is used", async ({
		expect,
	}) => {
		const mockRegistries = [
			{ domain: "123456789012.dkr.ecr.us-west-2.amazonaws.com" },
		];
		mockListRegistries(mockRegistries);
		await runWrangler("containers registries list --json");
		expect(JSON.parse(std.out)).toMatchInlineSnapshot(`
			[
			  {
			    "domain": "123456789012.dkr.ecr.us-west-2.amazonaws.com",
			  },
			]
		`);
	});
});

describe("containers registries delete", () => {
	const cliStd = mockCLIOutput();
	const std = mockConsoleMethods();
	const { setIsTTY } = useMockIsTTY();
	mockAccountId();
	mockApiToken();
	beforeEach(() => {
		mockAccount();
	});

	afterEach(() => {
		clearDialogs();
	});

	it("should delete a registry with confirmation", async ({ expect }) => {
		setIsTTY(true);
		const domain = "123456789012.dkr.ecr.us-west-2.amazonaws.com";
		mockConfirm({
			text: `Are you sure you want to delete the registry credentials for ${domain}? This action cannot be undone.`,
			result: true,
		});
		mockDeleteRegistry(domain);
		await runWrangler(`containers registries delete ${domain}`);
		expect(cliStd.stdout).toMatchInlineSnapshot(`
			"╭ Delete registry 123456789012.dkr.ecr.us-west-2.amazonaws.com
			│
			╰ Deleted registry 123456789012.dkr.ecr.us-west-2.amazonaws.com


			"
		`);
	});

	it("should cancel deletion when user says no", async ({ expect }) => {
		setIsTTY(true);
		const domain = "123456789012.dkr.ecr.us-west-2.amazonaws.com";
		mockConfirm({
			text: `Are you sure you want to delete the registry credentials for ${domain}? This action cannot be undone.`,
			result: false,
		});
		await runWrangler(`containers registries delete ${domain}`);
		expect(cliStd.stdout).toContain("The operation has been cancelled");
	});

	it("should delete a registry in non-interactive mode without skip confirmation flag", async ({
		expect,
	}) => {
		setIsTTY(false);
		const domain = "123456789012.dkr.ecr.us-west-2.amazonaws.com";
		mockDeleteRegistry(domain);
		await runWrangler(`containers registries delete ${domain}`);
		expect(cliStd.stdout).toMatchInlineSnapshot(`
			"╭ Delete registry 123456789012.dkr.ecr.us-west-2.amazonaws.com
			│
			╰ Deleted registry 123456789012.dkr.ecr.us-west-2.amazonaws.com


			"
		`);
		expect(std.out).toMatchInlineSnapshot(`
			"
			 ⛅️ wrangler x.x.x
			──────────────────
			? Are you sure you want to delete the registry credentials for 123456789012.dkr.ecr.us-west-2.amazonaws.com? This action cannot be undone.
			🤖 Using fallback value in non-interactive context: yes"
		`);
	});

	it("should delete a registry in interactive mode with --skip-confirmation flag", async ({
		expect,
	}) => {
		setIsTTY(true);
		const domain = "123456789012.dkr.ecr.us-west-2.amazonaws.com";
		mockDeleteRegistry(domain);
		await runWrangler(
			`containers registries delete ${domain} --skip-confirmation`
		);
		expect(cliStd.stdout).toMatchInlineSnapshot(`
			"╭ Delete registry 123456789012.dkr.ecr.us-west-2.amazonaws.com
			│
			╰ Deleted registry 123456789012.dkr.ecr.us-west-2.amazonaws.com


			"
		`);
	});

	describe("secret cleanup", () => {
		const domain = "123456789012.dkr.ecr.us-west-2.amazonaws.com";
		const storeId = "test-store-id";
		const secretName = "my-secret";
		const secretId = "secret-id-456";
		const secretsStoreRef = `${storeId}:${secretName}`;

		it("should delete registry and associated secret when user confirms", async ({
			expect,
		}) => {
			setIsTTY(true);
			mockConfirm({
				text: `Are you sure you want to delete the registry credentials for ${domain}? This action cannot be undone.`,
				result: true,
			});
			mockConfirm({
				text: `Do you want to delete the secret "${secretName}"? (Store ID: ${storeId})`,
				result: true,
			});
			mockDeleteRegistry(domain, secretsStoreRef);
			mockListSecrets(storeId, [
				{
					id: secretId,
					store_id: storeId,
					name: secretName,
					comment: "",
					scopes: ["containers"],
					created: "2024-01-01T00:00:00Z",
					modified: "2024-01-01T00:00:00Z",
					status: "active",
				},
			]);
			mockDeleteSecret(storeId, secretId);

			await runWrangler(`containers registries delete ${domain}`);

			expect(cliStd.stdout).toContain(`Deleted registry ${domain}`);
			expect(cliStd.stdout).toContain(`Deleted secret ${secretsStoreRef}`);
		});

		it("should delete registry but not secret when user declines secret deletion", async ({
			expect,
		}) => {
			setIsTTY(true);
			mockConfirm({
				text: `Are you sure you want to delete the registry credentials for ${domain}? This action cannot be undone.`,
				result: true,
			});
			mockConfirm({
				text: `Do you want to delete the secret "${secretName}"? (Store ID: ${storeId})`,
				result: false,
			});
			mockDeleteRegistry(domain, secretsStoreRef);

			await runWrangler(`containers registries delete ${domain}`);

			expect(cliStd.stdout).toContain(`Deleted registry ${domain}`);
			expect(cliStd.stdout).toContain("The secret was not deleted.");
		});

		it("should delete registry and secret with --skip-confirmation flag", async ({
			expect,
		}) => {
			setIsTTY(true);
			mockDeleteRegistry(domain, secretsStoreRef);
			mockListSecrets(storeId, [
				{
					id: secretId,
					store_id: storeId,
					name: secretName,
					comment: "",
					scopes: ["containers"],
					created: "2024-01-01T00:00:00Z",
					modified: "2024-01-01T00:00:00Z",
					status: "active",
				},
			]);
			mockDeleteSecret(storeId, secretId);

			await runWrangler(
				`containers registries delete ${domain} --skip-confirmation`
			);

			expect(cliStd.stdout).toContain(`Deleted registry ${domain}`);
			expect(cliStd.stdout).toContain(`Deleted secret ${secretsStoreRef}`);
		});

		it("should handle case when secret is already deleted", async ({
			expect,
		}) => {
			setIsTTY(true);
			mockConfirm({
				text: `Are you sure you want to delete the registry credentials for ${domain}? This action cannot be undone.`,
				result: true,
			});
			mockConfirm({
				text: `Do you want to delete the secret "${secretName}"? (Store ID: ${storeId})`,
				result: true,
			});
			mockDeleteRegistry(domain, secretsStoreRef);
			// Return empty list - secret not found
			mockListSecrets(storeId, []);

			await runWrangler(`containers registries delete ${domain}`);

			expect(cliStd.stdout).toContain(`Deleted registry ${domain}`);
			expect(cliStd.stdout).toContain(
				`Secret "${secretName}" not found in store. It may have already been deleted.`
			);
		});
	});
});

describe("containers registries credentials", () => {
	const { setIsTTY } = useMockIsTTY();
	const std = mockConsoleMethods();
	mockAccountId();
	mockApiToken();
	beforeEach(() => {
		mockAccount();
	});

	afterEach(() => {
		msw.resetHandlers();
	});

	it("should reject non-Cloudflare registry domains", async ({ expect }) => {
		setIsTTY(false);
		await expect(
			runWrangler("containers registries credentials example.com --push")
		).rejects.toThrowErrorMatchingInlineSnapshot(
			`[Error: The credentials command only accepts the Cloudflare managed registry (registry.cloudflare.com).]`
		);
	});

	it("should default to Cloudflare registry when DOMAIN is omitted", async ({
		expect,
	}) => {
		setIsTTY(false);
		mockGenerateCredentials(
			expect,
			"registry.cloudflare.com",
			"test-password",
			15,
			["push"]
		);

		await runWrangler("containers registries credentials --push");

		expect(std.out).toMatchInlineSnapshot(`"test-password"`);
	});

	it("should require --push or --pull", async ({ expect }) => {
		setIsTTY(false);
		await expect(
			runWrangler("containers registries credentials registry.cloudflare.com")
		).rejects.toThrowErrorMatchingInlineSnapshot(
			`[Error: You have to specify either --push or --pull in the command.]`
		);
	});

	it("should generate credentials with --push", async ({ expect }) => {
		setIsTTY(false);
		mockGenerateCredentials(
			expect,
			"registry.cloudflare.com",
			"test-password",
			15,
			["push"]
		);

		await runWrangler(
			"containers registries credentials registry.cloudflare.com --push"
		);

		expect(std.out).toMatchInlineSnapshot(`"test-password"`);
	});

	it("should generate credentials with --pull", async ({ expect }) => {
		setIsTTY(false);
		mockGenerateCredentials(
			expect,
			"registry.cloudflare.com",
			"test-password",
			15,
			["pull"]
		);

		await runWrangler(
			"containers registries credentials registry.cloudflare.com --pull"
		);

		expect(std.out).toMatchInlineSnapshot(`"test-password"`);
	});

	it("should generate credentials with both --push and --pull", async ({
		expect,
	}) => {
		setIsTTY(false);
		mockGenerateCredentials(
			expect,
			"registry.cloudflare.com",
			"jwt-token",
			15,
			["push", "pull"]
		);

		await runWrangler(
			"containers registries credentials registry.cloudflare.com --push --pull"
		);

		expect(std.out).toMatchInlineSnapshot(`"jwt-token"`);
	});

	it("should support custom expiration-minutes", async ({ expect }) => {
		setIsTTY(false);
		mockGenerateCredentials(
			expect,
			"registry.cloudflare.com",
			"custom-expiry-token",
			30,
			["push"]
		);

		await runWrangler(
			"containers registries credentials registry.cloudflare.com --push --expiration-minutes=30"
		);

		expect(std.out).toMatchInlineSnapshot(`"custom-expiry-token"`);
	});

	it("should generate credentials with --library-push", async ({ expect }) => {
		setIsTTY(false);
		mockGenerateCredentials(
			expect,
			"registry.cloudflare.com",
			"test-password",
			15,
			["library_push"]
		);

		await runWrangler(
			"containers registries credentials registry.cloudflare.com --library-push"
		);

		expect(std.out).toMatchInlineSnapshot(`"test-password"`);
	});

	it("should output valid JSON when --json flag is used", async ({
		expect,
	}) => {
		setIsTTY(false);
		mockGenerateCredentials(
			expect,
			"registry.cloudflare.com",
			"test-password",
			15,
			["push"]
		);

		await runWrangler(
			"containers registries credentials registry.cloudflare.com --push --json"
		);

		expect(JSON.parse(std.out)).toMatchInlineSnapshot(`
			{
			  "account_id": "some-account-id",
			  "password": "test-password",
			  "registry_host": "registry.cloudflare.com",
			  "username": "test-username",
			}
		`);
	});
});

const mockPutRegistry = (expect: ExpectStatic, expected?: object) => {
	msw.use(
		http.post(
			"*/accounts/:accountId/containers/registries",
			async ({ request }) => {
				if (expected) {
					const body = (await request.json()) as object;
					expect(body).toEqual(expected);
				}
				return HttpResponse.json(
					createFetchResult({
						domain: expected
							? (expected as { domain: string }).domain
							: "test.example.com",
					})
				);
			}
		)
	);
};

const mockListRegistries = (registries: { domain: string }[]) => {
	msw.use(
		http.get("*/accounts/:accountId/containers/registries", async () => {
			return HttpResponse.json(createFetchResult(registries));
		})
	);
};

const mockDeleteRegistry = (domain: string, secretsStoreRef?: string) => {
	msw.use(
		http.delete(
			`*/accounts/:accountId/containers/registries/${domain}`,
			async () => {
				return HttpResponse.json(
					createFetchResult({
						domain: domain,
						secrets_store_ref: secretsStoreRef,
					})
				);
			}
		)
	);
};

const mockGenerateCredentials = (
	expect: ExpectStatic,
	domain: string,
	password: string,
	expectedExpirationMinutes: number,
	expectedPermissions: string[]
) => {
	msw.use(
		http.post(
			`*/accounts/:accountId/containers/registries/${domain}/credentials`,
			async ({ request, params }) => {
				const body = (await request.json()) as {
					expiration_minutes: number;
					permissions: string[];
				};
				expect(body.expiration_minutes).toBe(expectedExpirationMinutes);
				expect(body.permissions).toEqual(expectedPermissions);
				return HttpResponse.json(
					createFetchResult({
						account_id: params.accountId,
						registry_host: domain,
						username: "test-username",
						password: password,
					})
				);
			}
		)
	);
};
