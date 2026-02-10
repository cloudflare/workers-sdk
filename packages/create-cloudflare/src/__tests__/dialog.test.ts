import { afterAll, afterEach, beforeAll, describe, test } from "vitest";
import { collectCLIOutput, normalizeOutput } from "../../../cli/test-util";
import { printSummary, printWelcomeMessage } from "../dialog";
import type { C3Context } from "types";

describe("dialog helpers", () => {
	const std = collectCLIOutput();
	const originalColumns = process.stdout.columns;

	beforeAll(() => {
		process.stdout.columns = 60;
	});

	afterAll(() => {
		process.stdout.columns = originalColumns;
	});

	describe("printWelcomeMessage", () => {
		test("with telemetry disabled", ({ expect }) => {
			printWelcomeMessage("0.0.0", false, {});

			expect(normalizeOutput(std.out)).toMatchInlineSnapshot(`
				"────────────────────────────────────────────────────────────
				👋 Welcome to create-cloudflare v0.0.0!
				🧡 Let's get started.
				────────────────────────────────────────────────────────────

				"
			`);
		});

		test("with telemetry enabled", ({ expect }) => {
			printWelcomeMessage("0.0.0", true, {});

			expect(normalizeOutput(std.out)).toMatchInlineSnapshot(`
				"────────────────────────────────────────────────────────────
				👋 Welcome to create-cloudflare v0.0.0!
				🧡 Let's get started.
				📊 Cloudflare collects telemetry about your usage of Create-Cloudflare.

				Learn more at: https://github.com/cloudflare/workers-sdk/blob/main/packages/create-cloudflare/telemetry.md
				────────────────────────────────────────────────────────────

				"
			`);
		});

		test("with telemetry disabled in experimental mode", ({ expect }) => {
			printWelcomeMessage("0.0.0", false, { experimental: true });

			expect(normalizeOutput(std.out)).toMatchInlineSnapshot(`
				"────────────────────────────────────────────────────────────
				👋 Welcome to create-cloudflare v0.0.0!
				🧡 Let's get started.

				🧪 Running in experimental mode
				────────────────────────────────────────────────────────────

				"
			`);
		});

		test("with telemetry enabled in experimental mode", ({ expect }) => {
			printWelcomeMessage("0.0.0", true, { experimental: true });

			expect(normalizeOutput(std.out)).toMatchInlineSnapshot(`
				"────────────────────────────────────────────────────────────
				👋 Welcome to create-cloudflare v0.0.0!
				🧡 Let's get started.

				🧪 Running in experimental mode

				📊 Cloudflare collects telemetry about your usage of Create-Cloudflare.

				Learn more at: https://github.com/cloudflare/workers-sdk/blob/main/packages/create-cloudflare/telemetry.md
				────────────────────────────────────────────────────────────

				"
			`);
		});
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

		afterEach(() => {
			process.stdout.columns = originalStdoutColumns;
		});

		test("with deploy", async ({ expect }) => {
			await printSummary(ctx);

			expect(normalizeOutput(std.out)).toMatchInlineSnapshot(`
				"────────────────────────────────────────────────────────────
				🎉  SUCCESS  Application deployed successfully!

				🔍 View Project
				Visit: https://example.test.workers.dev
				Dash: https://dash.cloudflare.com/?to=/:account/workers/services/view/test-project

				💻 Continue Developing
				Deploy again: pnpm run deploy

				📖 Explore Documentation
				https://developers.cloudflare.com/workers

				🐛 Report an Issue
				https://github.com/cloudflare/workers-sdk/issues/new/choose

				💬 Join our Community
				https://discord.cloudflare.com
				────────────────────────────────────────────────────────────

				"
			`);
		});

		test("with no deploy", async ({ expect }) => {
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
				"────────────────────────────────────────────────────────────
				🎉  SUCCESS  Application created successfully!

				💻 Continue Developing
				Change directories: cd ../example
				Deploy: pnpm run deploy

				📖 Explore Documentation
				https://developers.cloudflare.com/pages

				🐛 Report an Issue
				https://github.com/cloudflare/workers-sdk/issues/new/choose

				💬 Join our Community
				https://discord.cloudflare.com
				────────────────────────────────────────────────────────────

				"
			`);
		});
	});
});
