import { runInTempDir, seed } from "@cloudflare/workers-utils/test-helpers";
import { dedent } from "ts-dedent";
import { describe, test } from "vitest";
import { getCloudflareTypesTsconfigUpdate } from "../src/tsconfig";

describe("autoconfig - getCloudflareTypesTsconfigUpdate()", () => {
	runInTempDir();

	test("adds .cloudflare/types to include, keeping the formatting of include", async ({
		expect,
	}) => {
		await seed({
			"tsconfig.json": dedent`
				{
				    // An over-indented comment
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
				    // An over-indented comment
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

		await seed({
			"tsconfig.json": JSON.stringify({ include: [".cloudflare-old"] }),
		});
		expect(getCloudflareTypesTsconfigUpdate(process.cwd())?.type).toBe(
			"update"
		);

		await seed({
			"tsconfig.json": JSON.stringify({
				include: [".cloudflare/types/old.d.ts"],
			}),
		});
		expect(getCloudflareTypesTsconfigUpdate(process.cwd())?.type).toBe(
			"update"
		);
	});

	test("keeps a UTF-8 byte order mark", async ({ expect }) => {
		await seed({
			"tsconfig.json": `\uFEFF${JSON.stringify({ include: ["src"] })}`,
		});

		const update = getCloudflareTypesTsconfigUpdate(process.cwd());
		const content = update?.type === "update" ? update.content : "";

		expect(content.startsWith("\uFEFF")).toBe(true);
		expect(JSON.parse(content.slice(1))).toEqual({
			include: ["src", ".cloudflare/types"],
		});
	});

	test("points to the referenced tsconfig when tsconfig.json uses project references", async ({
		expect,
	}) => {
		await seed({
			"tsconfig.json": JSON.stringify({
				files: [],
				references: [{ path: "./tsconfig.cloudflare.json" }],
			}),
		});

		expect(getCloudflareTypesTsconfigUpdate(process.cwd())).toEqual({
			type: "manual",
			message: expect.stringContaining(
				"to the `include` array of the referenced tsconfig that covers your Worker code, as a path relative to that tsconfig"
			),
		});

		// Without any referenced config, the root's default or inherited includes apply
		await seed({ "tsconfig.json": JSON.stringify({ references: [] }) });
		expect(getCloudflareTypesTsconfigUpdate(process.cwd())).toEqual({
			type: "manual",
			message: expect.stringContaining("Add an `include` array"),
		});
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
				  "message": "Add an \`include\` array to tsconfig.json that keeps the files it includes today and adds ".cloudflare/types", for example ["**/*",".cloudflare/types"], so that TypeScript can find the types that \`cf workers types\` generates.",
				  "type": "manual",
				}
			`);
	});
});
