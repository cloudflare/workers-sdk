import { describe, expect } from "vitest";
import { Astro } from "../../autoconfig/frameworks/astro";
import { Static } from "../../autoconfig/frameworks/static";
import { buildAndConfirmOperationsSummary } from "../../autoconfig/run";
import { dedent } from "../../utils/dedent";
import { mockConsoleMethods } from "../helpers/mock-console";
import { mockConfirm } from "../helpers/mock-dialogs";
import { useMockIsTTY } from "../helpers/mock-istty";
import type { RawConfig } from "@cloudflare/workers-utils";

const testRawConfig: RawConfig = {
	$schema: "node_modules/wrangler/config-schema.json",
	name: "worker-name",
	compatibility_date: "2025-01-01",
	observability: {
		enabled: true,
	},
};

describe("autoconfig run - buildAndConfirmOperationsSummary()", () => {
	const std = mockConsoleMethods();
	const { setIsTTY } = useMockIsTTY();

	describe("interactive mode", () => {
		test.each([true, false])(
			"`confirmed` matches the user's confirmation result - %s",
			async (userChoice) => {
				setIsTTY(true);

				mockConfirm({
					text: "Proceed with setup?",
					result: userChoice,
				});
				const updatedAutoConfigDetails = await buildAndConfirmOperationsSummary(
					{
						workerName: "worker-name",
						projectPath: "<PROJECT_PATH>",
						configured: false,
					},
					testRawConfig
				);

				expect(updatedAutoConfigDetails).toMatchObject({
					confirmed: userChoice,
				});
			}
		);

		test("presents a summary for a simple project where only a wrangler.jsonc file needs to be created", async () => {
			setIsTTY(true);

			mockConfirm({
				text: "Proceed with setup?",
				result: true,
			});
			await buildAndConfirmOperationsSummary(
				{
					workerName: "worker-name",
					projectPath: "<PROJECT_PATH>",
					configured: false,
				},
				testRawConfig
			);

			expect(std.out).toMatchInlineSnapshot(`
				"
				📄 Create wrangler.jsonc:
				  {
				    \\"$schema\\": \\"node_modules/wrangler/config-schema.json\\",
				    \\"name\\": \\"worker-name\\",
				    \\"compatibility_date\\": \\"2025-01-01\\",
				    \\"observability\\": {
				      \\"enabled\\": true
				    }
				  }
				"
			`);
		});

		test("shows that wrangler will be added as a devDependency when not already installed as such", async () => {
			setIsTTY(true);

			mockConfirm({
				text: "Proceed with setup?",
				result: true,
			});
			await buildAndConfirmOperationsSummary(
				{
					workerName: "worker-name",
					projectPath: "<PROJECT_PATH>",
					packageJson: {
						name: "my-project",
						devDependencies: {},
					},
					configured: false,
				},
				testRawConfig
			);

			expect(std.out).toContain(
				dedent`
				📦 Install packages:
				 - wrangler (devDependency)
				`
			);
		});

		test("when a package.json is present wrangler@latest will be unconditionally installed (even if already present)", async () => {
			setIsTTY(true);

			mockConfirm({
				text: "Proceed with setup?",
				result: true,
			});
			await buildAndConfirmOperationsSummary(
				{
					workerName: "worker-name",
					projectPath: "<PROJECT_PATH>",
					packageJson: {
						name: "my-project",
						devDependencies: {
							wrangler: "^4.0.0",
						},
					},
					configured: false,
				},
				testRawConfig
			);

			expect(std.out).toContain(
				dedent`
				📦 Install packages:
				 - wrangler (devDependency)
				`
			);
		});

		test("shows that when needed a framework specific configuration will be run", async () => {
			setIsTTY(true);

			mockConfirm({
				text: "Proceed with setup?",
				result: true,
			});
			await buildAndConfirmOperationsSummary(
				{
					workerName: "worker-name",
					projectPath: "<PROJECT_PATH>",
					framework: new Astro(),
					configured: false,
				},
				testRawConfig
			);

			expect(std.out).toContain(
				'🛠️  Configuring project for Astro with "astro add cloudflare"'
			);
		});

		test("doesn't show the framework specific configuration step for the Static framework", async () => {
			setIsTTY(true);

			mockConfirm({
				text: "Proceed with setup?",
				result: true,
			});
			await buildAndConfirmOperationsSummary(
				{
					workerName: "worker-name",
					projectPath: "<PROJECT_PATH>",
					framework: new Static("static"),
					configured: false,
				},
				testRawConfig
			);

			expect(std.out).not.toContain("🛠️  Configuring project for");
		});
	});

	describe("non-interactive mode", () => {
		test("prints the summary and automatically confirms it", async () => {
			setIsTTY(false);

			const updatedAutoConfigDetails = await buildAndConfirmOperationsSummary(
				{
					workerName: "worker-name",
					projectPath: "<PROJECT_PATH>",
					packageJson: {
						name: "my-project",
						devDependencies: {},
					},
					configured: false,
				},
				testRawConfig
			);

			expect(std.out).toMatchInlineSnapshot(`
				"
				📦 Install packages:
				 - wrangler (devDependency)

				📄 Create wrangler.jsonc:
				  {
				    \\"$schema\\": \\"node_modules/wrangler/config-schema.json\\",
				    \\"name\\": \\"worker-name\\",
				    \\"compatibility_date\\": \\"2025-01-01\\",
				    \\"observability\\": {
				      \\"enabled\\": true
				    }
				  }

				? Proceed with setup?
				🤖 Using fallback value in non-interactive context: yes"
			`);

			expect(updatedAutoConfigDetails).toMatchObject({
				confirmed: true,
				modifications: {
					wranglerInstall: true,
					typegenScriptAddition: false,
				},
			});
		});
	});
});
