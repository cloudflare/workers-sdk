import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { CLOUDFLARE_ACCOUNT_ID } from "./helpers/account-id";
import { WranglerE2ETestHelper } from "./helpers/e2e-wrangler-test";
import { generateResourceName } from "./helpers/generate-resource-name";
import { normalizeOutput } from "./helpers/normalize";

const RUNTIMES = [
	...(CLOUDFLARE_ACCOUNT_ID ? [{ flags: "--remote", runtime: "remote" }] : []),
	{ flags: "", runtime: "local" },
];

describe.each(RUNTIMES)(
	"secrets-store $runtime",
	async ({ flags, runtime }) => {
		let cachedStoreId = runtime === "local" ? "storeid" : "";
		let cachedSecretId = "";

		const storeName = generateResourceName("secrets-store-store");
		const secretName = generateResourceName("secrets-store-secret");
		const helper = new WranglerE2ETestHelper();

		const originalColumns = process.stdout.columns;
		beforeAll(() => {
			process.stdout.columns = 180;
		});

		afterAll(() => {
			process.stdout.columns = originalColumns;
		});

		const normalize = (str: string) => {
			return normalizeOutput(str, {
				[storeName]: "tmp-e2e-secrets-store-store",
				[secretName]: "tmp-e2e-secrets-store-secret",
			});
		};

		it("creates a store", async () => {
			const output = await helper.run(
				`wrangler secrets-store store create ${storeName} ${flags}`
			);

			if (runtime === "local") {
				expect(output.stderr).toContain(
					"To create a Secrets Store on your account, use the --remote flag"
				);
				return;
			}

			const regex = /ID:\s*(\w{32})/;
			const match = output.stdout.match(regex);

			if (match && match[1]) {
				cachedStoreId = match[1];
			} else {
				throw new Error("No uuid for store found.");
			}

			expect(normalize(output.stdout)).toBe(
				`🔐 Creating store... (Name: tmp-e2e-secrets-store-store-00000000-0000-0000-0000-000000000000)
✅ Created store! (Name: tmp-e2e-secrets-store-store-00000000-0000-0000-0000-000000000000, ID: 00000000000000000000000000000000)`
			);
		});

		it("lists stores", async () => {
			const output = await helper.run(
				`wrangler secrets-store store list --per-page 100 ${flags}`
			);
			if (runtime === "local") {
				expect(output.stderr).toContain(
					"This command is not supported in local mode"
				);
				return;
			}

			expect(normalize(output.stdout)).toContain(
				"tmp-e2e-secrets-store-store-00000000-0000-0000-0000-000000000000"
			);
		});

		it("creates a secret", async () => {
			const output = await helper.run(
				`wrangler secrets-store secret create ${cachedStoreId} --name ${secretName} --value shh --scopes workers --comment test ${flags}`
			);

			const regex = /ID:\s*(\w{32})/;
			const match = output.stdout.match(regex);

			if (match && match[1]) {
				cachedSecretId = match[1];
			}

			expect(normalize(output.stdout)).toContain(
				"🔐 Creating secret... (Name: tmp-e2e-secrets-store-secret-00000000-0000-0000-0000-000000000000, Value: REDACTED, Scopes: workers, Comment: test"
			);
			expect(normalize(output.stdout)).toContain(
				"✅ Created secret! (ID: 00000000000000000000000000000000)"
			);
		});

		it("gets a secret", async () => {
			const output = await helper.run(
				`wrangler secrets-store secret get ${cachedStoreId} --secret-id ${cachedSecretId} ${flags}`
			);

			expect(normalize(output.stdout)).toContain(
				"🔐 Getting secret... (ID: 00000000000000000000000000000000)"
			);
			expect(normalize(output.stdout)).toContain(
				"tmp-e2e-secrets-store-secret-00000000-0000-0000-0000-000000000000"
			);
		});

		it("updates a secret", async () => {
			const output = await helper.run(
				`wrangler secrets-store secret update ${cachedStoreId} --secret-id ${cachedSecretId} --value shh ${flags}`
			);

			expect(normalize(output.stdout)).toContain(
				"🔐 Updating secret... (ID: 00000000000000000000000000000000)"
			);
			expect(normalize(output.stdout)).toContain(
				"✅ Updated secret! (ID: 00000000000000000000000000000000)"
			);
		});

		it("deletes a secret", async () => {
			const output = await helper.run(
				`wrangler secrets-store secret delete ${cachedStoreId} --secret-id ${cachedSecretId} ${flags}`
			);

			expect(normalize(output.stdout))
				.toBe(`🔐 Deleting secret... (ID: 00000000000000000000000000000000)
✅ Deleted secret! (ID: 00000000000000000000000000000000)`);
		});

		it("validates a secret is deleted", async () => {
			const output = await helper.run(
				`wrangler secrets-store secret get ${cachedStoreId} --secret-id ${cachedSecretId} ${flags}`
			);

			expect(normalize(output.stdout)).toContain(
				"🔐 Getting secret... (ID: 00000000000000000000000000000000)"
			);
			if (runtime === "remote") {
				expect(normalize(output.stderr)).toContain(
					"secret_not_found [code: 1001]"
				);
			} else {
				expect(normalize(output.stderr)).toContain("Secret not found");
			}
		});

		it.skipIf(runtime === "local")("deletes a store", async () => {
			const output = await helper.run(
				`wrangler secrets-store store delete ${cachedStoreId} ${flags}`
			);
			if (runtime === "local") {
				expect(output.stderr).toContain(
					"This command is not supported in local mode"
				);
				return;
			}

			expect(normalize(output.stdout))
				.toBe(`🔐 Deleting store... (Name: 00000000000000000000000000000000)
✅ Deleted store! (ID: 00000000000000000000000000000000)`);
		});

		it.skipIf(runtime === "local")("validates a store is deleted", async () => {
			const output = await helper.run(
				`wrangler secrets-store secret get ${cachedStoreId} --secret-id ${cachedSecretId} ${flags}`
			);

			expect(normalize(output.stdout)).toContain(
				"🔐 Getting secret... (ID: 00000000000000000000000000000000)"
			);
			expect(normalize(output.stderr)).toContain(
				"store_not_found [code: 1001]"
			);
		});
	}
);
