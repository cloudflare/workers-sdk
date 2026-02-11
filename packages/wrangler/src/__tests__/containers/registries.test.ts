import { http, HttpResponse } from "msw";
/* eslint-disable workers-sdk/no-vitest-import-expect -- expect used in MSW handlers and module-level helpers */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
/* eslint-enable workers-sdk/no-vitest-import-expect */
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

describe("containers registries configure", () => {
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

	it("should reject unsupported registry domains", async () => {
		await expect(
			runWrangler(
				`containers registries configure docker.io --public-credential=test-id`
			)
		).rejects.toThrowErrorMatchingInlineSnapshot(`
			[Error: docker.io is not a supported image registry.
			Currently we support the following non-Cloudflare registries: AWS ECR.
			To use an existing image from another repository, see https://developers.cloudflare.com/containers/platform-details/image-management/#using-pre-built-container-images]
		`);
	});

	it("should validate command line arguments for Secrets Store", async () => {
		const domain = "123456789012.dkr.ecr.us-west-2.amazonaws.com";
		await expect(
			runWrangler(
				`containers registries configure ${domain} --public-credential=test-id --disableSecretsStore`
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
			`[Error: Secrets Store is not supported in FedRAMP compliance regions. You must set --disableSecretsStore.]`
		);

		await expect(
			runWrangler(
				`containers registries configure ${domain} --aws-access-key-id=test-access-key-id --secret-store-id=storeid --disableSecretsStore`
			)
		).rejects.toThrowErrorMatchingInlineSnapshot(
			`[Error: Arguments secret-store-id and disableSecretsStore are mutually exclusive]`
		);

		await expect(
			runWrangler(
				`containers registries configure ${domain} --aws-access-key-id=test-access-key-id --secret-name=secret-name --disableSecretsStore`
			)
		).rejects.toThrowErrorMatchingInlineSnapshot(
			`[Error: Arguments secret-name and disableSecretsStore are mutually exclusive]`
		);
	});

	it("should no-op on cloudflare registry (default)", async () => {
		await runWrangler(
			`containers registries configure registry.cloudflare.com --public-credential=test-id`
		);
		expect(cliStd.stdout).toMatchInlineSnapshot(`
			"╭ Configure a container registry
			│
			│ Configuring Cloudflare Containers Managed Registry registry: registry.cloudflare.com
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

		it("should configure AWS ECR registry with interactive prompts", async () => {
			setIsTTY(true);
			const awsEcrDomain = "123456789012.dkr.ecr.us-west-2.amazonaws.com";
			mockPrompt({
				text: "Enter AWS Secret Access Key:",
				options: { isSecret: true },
				result: "test-secret-access-key",
			});

			mockPutRegistry({
				domain: "123456789012.dkr.ecr.us-west-2.amazonaws.com",
				is_public: false,
				auth: {
					public_credential: "test-access-key-id",
					private_credential: "test-secret-access-key",
				},
				kind: "ECR",
			});

			await runWrangler(
				`containers registries configure ${awsEcrDomain} --aws-access-key-id=test-access-key-id --disableSecretsStore`
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

			it("should accept the secret from piped input", async () => {
				const secret = "wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY";

				mockStdIn.send(secret);
				mockPutRegistry({
					domain: awsEcrDomain,
					is_public: false,
					auth: {
						public_credential: "test-access-key-id",
						private_credential: "wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY",
					},
					kind: "ECR",
				});

				await runWrangler(
					`containers registries configure ${awsEcrDomain} --public-credential=test-access-key-id --disableSecretsStore`
				);
			});
		});
	});

	describe("AWS ECR registry configuration", () => {
		it("should configure AWS ECR registry with interactive prompts", async () => {
			setIsTTY(true);
			const awsEcrDomain = "123456789012.dkr.ecr.us-west-2.amazonaws.com";
			const storeId = "test-store-id-123";
			mockPrompt({
				text: "Enter AWS Secret Access Key:",
				options: { isSecret: true },
				result: "test-secret-access-key",
			});
			mockPrompt({
				text: "Secret name:",
				options: { isSecret: false, defaultValue: "AWS_Secret_Access_Key" },
				result: "AWS_Secret_Access_Key",
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
			mockCreateSecret(storeId);
			mockPutRegistry({
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

		it("will create a secret store if no existing stores are returned from the api", async () => {
			setIsTTY(true);
			const awsEcrDomain = "123456789012.dkr.ecr.us-west-2.amazonaws.com";
			const newStoreId = "new-store-id-456";

			mockPrompt({
				text: "Enter AWS Secret Access Key:",
				options: { isSecret: true },
				result: "test-secret-access-key",
			});
			mockConfirm({
				text: "No existing Secret Stores found. Create a Secret Store to store your registry credentials?",
				result: true,
			});
			mockPrompt({
				text: "Secret name:",
				options: { isSecret: false, defaultValue: "AWS_Secret_Access_Key" },
				result: "AWS_Secret_Access_Key",
			});

			mockListSecretStores([]);
			mockCreateSecretStore(newStoreId);
			mockCreateSecret(newStoreId);
			mockPutRegistry({
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

		it("will use an existing secret store if a store id is provided", async () => {
			setIsTTY(true);
			const awsEcrDomain = "123456789012.dkr.ecr.us-west-2.amazonaws.com";
			const providedStoreId = "provided-store-id-789";

			mockPrompt({
				text: "Enter AWS Secret Access Key:",
				options: { isSecret: true },
				result: "test-secret-access-key",
			});
			mockPrompt({
				text: "Secret name:",
				options: { isSecret: false, defaultValue: "AWS_Secret_Access_Key" },
				result: "AWS_Secret_Access_Key",
			});

			mockCreateSecret(providedStoreId);
			mockPutRegistry({
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
				│ Getting AWS Secret Access Key...
				│
				│
				│ Setting up integration with Secrets Store...
				│
				│
				│
				│ Container-scoped secret AWS_Secret_Access_Key created in Secrets Store.
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

			it("should accept the secret from piped input", async () => {
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
				mockCreateSecret(storeId);
				mockPutRegistry({
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

	it("should list empty registries", async () => {
		mockListRegistries([]);
		await runWrangler("containers registries list");
		expect(cliStd.stdout).toMatchInlineSnapshot(`
			"╭ List configured container registries
			│
			╰ No registries configured for this account

			"
		`);
	});

	it("should list configured registries", async () => {
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

	it("should output JSON when --json flag is used", async () => {
		const mockRegistries = [
			{ domain: "123456789012.dkr.ecr.us-west-2.amazonaws.com" },
		];
		mockListRegistries(mockRegistries);
		await runWrangler("containers registries list --json");
		expect(std.out).toMatchInlineSnapshot(`
			"[
			    {
			        "domain": "123456789012.dkr.ecr.us-west-2.amazonaws.com"
			    }
			]"
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

	it("should delete a registry with confirmation", async () => {
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

	it("should cancel deletion when user says no", async () => {
		setIsTTY(true);
		const domain = "123456789012.dkr.ecr.us-west-2.amazonaws.com";
		mockConfirm({
			text: `Are you sure you want to delete the registry credentials for ${domain}? This action cannot be undone.`,
			result: false,
		});
		await runWrangler(`containers registries delete ${domain}`);
		expect(cliStd.stdout).toContain("The operation has been cancelled");
	});

	it("should delete a registry in non-interactive mode without skip confirmation flag", async () => {
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

	it("should delete a registry in interactive mode with --skip-confirmation flag", async () => {
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

		it("should delete registry and associated secret when user confirms", async () => {
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

		it("should delete registry but not secret when user declines secret deletion", async () => {
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

		it("should delete registry and secret with --skip-confirmation flag", async () => {
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

		it("should handle case when secret is already deleted", async () => {
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

const mockPutRegistry = (expected?: object) => {
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
