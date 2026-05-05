import { describe, it } from "vitest";
import { CLOUDFLARE_ACCOUNT_ID } from "./helpers/account-id";
import { WranglerE2ETestHelper } from "./helpers/e2e-wrangler-test";
import { generateResourceName } from "./helpers/generate-resource-name";
import { normalizeOutput } from "./helpers/normalize";

describe.skipIf(!CLOUDFLARE_ACCOUNT_ID)("agent-memory", () => {
	const namespaceName = generateResourceName("agent-memory", 8);
	let namespaceId = "";

	const helper = new WranglerE2ETestHelper();

	const normalize = (str: string) =>
		normalizeOutput(str, { [namespaceName]: "tmp-e2e-agent-memory" });

	it("create namespace", async ({ expect }) => {
		const output = await helper.run(
			`wrangler agent-memory namespace create ${namespaceName}`
		);

		expect(normalize(output.stdout)).toContain(
			`✅ Created Agent Memory namespace "tmp-e2e-agent-memory"`
		);
		expect(normalize(output.stderr)).toMatchInlineSnapshot(`
			"▲ [WARNING] 🚧 \`wrangler agent-memory namespace create\` is an open beta command. Please report any issues to https://github.com/cloudflare/workers-sdk/issues/new/choose"
		`);

		// Extract the namespace ID for use in subsequent tests
		const match = output.stdout.match(/ID:\s+(\S+)/);
		if (!match) {
			throw new Error("Could not extract namespace ID from create output");
		}
		namespaceId = match[1];
	});

	it("list namespaces", async ({ expect }) => {
		const output = await helper.run(`wrangler agent-memory namespace list`);

		expect(normalize(output.stdout)).toContain("tmp-e2e-agent-memory");
		expect(normalize(output.stderr)).toMatchInlineSnapshot(`
			"▲ [WARNING] 🚧 \`wrangler agent-memory namespace list\` is an open beta command. Please report any issues to https://github.com/cloudflare/workers-sdk/issues/new/choose"
		`);
	});

	it("list namespaces --json", async ({ expect }) => {
		const output = await helper.run(
			`wrangler agent-memory namespace list --json`
		);

		const parsed = JSON.parse(output.stdout) as Array<{
			id: string;
			name: string;
		}>;
		const found = parsed.find((ns) => ns.name === namespaceName);
		expect(found).toBeDefined();
		expect(found?.id).toBe(namespaceId);
		expect(normalize(output.stderr)).toMatchInlineSnapshot(`
			"▲ [WARNING] 🚧 \`wrangler agent-memory namespace list\` is an open beta command. Please report any issues to https://github.com/cloudflare/workers-sdk/issues/new/choose"
		`);
	});

	it("get namespace", async ({ expect }) => {
		const output = await helper.run(
			`wrangler agent-memory namespace get ${namespaceName}`
		);

		expect(normalize(output.stdout)).toContain("tmp-e2e-agent-memory");
		expect(output.stdout).toContain(namespaceId);
		expect(normalize(output.stderr)).toMatchInlineSnapshot(`
			"▲ [WARNING] 🚧 \`wrangler agent-memory namespace get\` is an open beta command. Please report any issues to https://github.com/cloudflare/workers-sdk/issues/new/choose"
		`);
	});

	it("delete namespace", async ({ expect }) => {
		const output = await helper.run(
			`wrangler agent-memory namespace delete ${namespaceName} --force`
		);

		expect(normalize(output.stdout)).toContain(
			`✅ Deleted Agent Memory namespace tmp-e2e-agent-memory`
		);
		expect(normalize(output.stderr)).toMatchInlineSnapshot(`
			"▲ [WARNING] 🚧 \`wrangler agent-memory namespace delete\` is an open beta command. Please report any issues to https://github.com/cloudflare/workers-sdk/issues/new/choose"
		`);
	});
});
