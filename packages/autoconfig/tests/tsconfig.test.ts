import { runInTempDir, seed } from "@cloudflare/workers-utils/test-helpers";
import { dedent } from "ts-dedent";
import { describe, test } from "vitest";
import { getCloudflareTypesTsconfigUpdate } from "../src/tsconfig";

describe("autoconfig - getCloudflareTypesTsconfigUpdate()", () => {
	runInTempDir();

	test("adds .cloudflare/types to include, keeping the existing formatting", async ({
		expect,
	}) => {
		await seed({
			"tsconfig.json": dedent`
				{
				  "include": [
				    "**/*",
				    ".react-router/types/**/*"
				  ],
				  "compilerOptions": {
				    "lib": ["DOM", "ES2022"]
				  }
				}
			`,
		});

		const update = getCloudflareTypesTsconfigUpdate(process.cwd());

		expect(update?.type === "update" && update.content).toMatchInlineSnapshot(`
				"{
				  "include": [
				    "**/*",
				    ".react-router/types/**/*",
				    ".cloudflare/types"
				  ],
				  "compilerOptions": {
				    "lib": ["DOM", "ES2022"]
				  }
				}"
			`);
	});

	test("keeps comments and tab indentation", async ({ expect }) => {
		await seed({
			"tsconfig.json": dedent`
				{
					// The app's sources
					"include": [
						"src"
					]
				}
			`,
		});

		const update = getCloudflareTypesTsconfigUpdate(process.cwd());

		expect(update?.type === "update" && update.content).toMatchInlineSnapshot(`
				"{
					// The app's sources
					"include": [
						"src",
						".cloudflare/types"
					]
				}"
			`);
	});

	test("does nothing when the types are already included or there is no tsconfig.json", async ({
		expect,
	}) => {
		expect(getCloudflareTypesTsconfigUpdate(process.cwd())).toBeUndefined();

		await seed({
			"tsconfig.json": JSON.stringify({
				include: ["src", "./.cloudflare/types"],
			}),
		});
		expect(getCloudflareTypesTsconfigUpdate(process.cwd())).toBeUndefined();
	});

	test("asks for a manual update when tsconfig.json has no include array", async ({
		expect,
	}) => {
		await seed({
			"tsconfig.json": JSON.stringify({ extends: "./tsconfig.base.json" }),
		});

		expect(getCloudflareTypesTsconfigUpdate(process.cwd()))
			.toMatchInlineSnapshot(`
				{
				  "message": "Add ".cloudflare/types" to the \`include\` array in tsconfig.json so that TypeScript can find the types that \`cf workers types\` generates.",
				  "type": "manual",
				}
			`);
	});
});
