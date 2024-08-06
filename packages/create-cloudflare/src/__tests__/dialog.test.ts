import { afterAll, beforeAll, describe, expect, test } from "vitest";
import { collectCLIOutput, normalizeOutput } from "../../../cli/test-util";
import { printSummary, printWelcomeMessage } from "../dialog";
import type { C3Context } from "types";

describe("dialog helpers", () => {
	const std = collectCLIOutput();

	test("printWelcomeMessage", () => {
		printWelcomeMessage("0.0.0");

		expect(normalizeOutput(std.out)).toMatchInlineSnapshot(`
			" ╭──────────────────────────────────────────────────────────────╮
			 │ 👋 Welcome to create-cloudflare v0.0.0!                      │
			 │ 🧡 Let's get started.                                        │
			 ╰──────────────────────────────────────────────────────────────╯
			"
		`);
	});

	describe("printSummary", () => {
		const ctx: C3Context = {
			project: { name: "test-project", path: "./workspace" },
			args: {
				projectName: "test-project",
			},
			template: {
				configVersion: 1,
				id: "test",
				displayName: "display-name",
				platform: "workers",
			},
			account: {
				id: "account-id",
				name: "account-name",
			},
			deployment: {
				url: "https://example.test.workers.dev",
			},
			originalCWD: "./workspace",
			gitRepoAlreadyExisted: false,
		};

		let originalStdoutColumns: number;

		beforeAll(() => {
			originalStdoutColumns = process.stdout.columns;
		});

		afterAll(() => {
			process.stdout.columns = originalStdoutColumns;
		});

		test("with deploy", async () => {
			await printSummary(ctx);

			expect(normalizeOutput(std.out)).toMatchInlineSnapshot(`
				" ╭───────────────────────────────────────────────────────────────────────────────────────╮
				 │ 🎉  SUCCESS  Application deployed successfully!                                       │
				 │                                                                                       │
				 │ 🔍 View Project                                                                       │
				 │    Visit: https://example.test.workers.dev                                            │
				 │    Dash: https://dash.cloudflare.com/?to=/:account/workers/services/view/test-project │
				 │                                                                                       │
				 │ 💻 Continue Developing                                                                │
				 │    Start dev server: npm run start                                                   │
				 │    Deploy again: npm run deploy                                                      │
				 │                                                                                       │
				 │ 📖 Explore Documentation                                                              │
				 │    https://developers.cloudflare.com/workers                                          │
				 │                                                                                       │
				 │ 💬 Join our Community                                                                 │
				 │    https://discord.cloudflare.com                                                     │
				 ╰───────────────────────────────────────────────────────────────────────────────────────╯
				"
			`);
		});

		test("with no deploy", async () => {
			await printSummary({
				...ctx,
				account: undefined,
				deployment: {},
				project: { name: "test-project", path: "./example" },
				template: {
					...ctx.template,
					platform: "pages",
				},
			});

			expect(normalizeOutput(std.out)).toMatchInlineSnapshot(`
				" ╭──────────────────────────────────────────────────────────────╮
				 │ 🎉  SUCCESS  Application created successfully!               │
				 │                                                              │
				 │ 💻 Continue Developing                                       │
				 │    Change directories: cd ../example                         │
				 │    Start dev server: npm run start                          │
				 │    Deploy: npm run deploy                                   │
				 │                                                              │
				 │ 📖 Explore Documentation                                     │
				 │    https://developers.cloudflare.com/pages                   │
				 │                                                              │
				 │ 💬 Join our Community                                        │
				 │    https://discord.cloudflare.com                            │
				 ╰──────────────────────────────────────────────────────────────╯
				"
			`);
		});

		test("with lines truncated", async () => {
			process.stdout.columns = 40;

			await printSummary(ctx);

			expect(normalizeOutput(std.out)).toMatchInlineSnapshot(`
				" ╭─────────────────────────────────────╮
				 │ 🎉  SUCCESS  Application deploye... │
				 │                                     │
				 │ 🔍 View Project                     │
				 │    Visit: https://example.test.w... │
				 │    Dash: https://dash.cloudflare... │
				 │                                     │
				 │ 💻 Continue Developing              │
				 │    Start dev server: npm run start │
				 │    Deploy again: npm run deploy    │
				 │                                     │
				 │ 📖 Explore Documentation            │
				 │    https://developers.cloudflare... │
				 │                                     │
				 │ 💬 Join our Community               │
				 │    https://discord.cloudflare.com   │
				 ╰─────────────────────────────────────╯
				"
			`);
		});
	});
});
