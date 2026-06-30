import { runInTempDir } from "@cloudflare/workers-utils/test-helpers";
import { detectAgenticEnvironment } from "am-i-vibing";
import { afterEach, beforeEach, describe, it, vi } from "vitest";
import { experimental_getWranglerCommands } from "../../experimental-commands-api";
import { resolveCommandNode } from "../../help/agent-help";
import { mockConsoleMethods } from "../helpers/mock-console";
import { runWrangler } from "../helpers/run-wrangler";
import type { AgenticType } from "am-i-vibing";

vi.mock("am-i-vibing");

function mockDetectedType(type: AgenticType | null): void {
	vi.mocked(detectAgenticEnvironment).mockReturnValue({
		id: type ? `mock-${type}` : null,
		isAgentic: type !== null,
		name: type ? `Mock ${type}` : null,
		type,
	});
}

describe("agent help", () => {
	runInTempDir();
	const std = mockConsoleMethods();

	beforeEach(() => {
		// The shared test setup pins WRANGLER_HELP_FORMAT=human for deterministic
		// snapshots. Remove it here so auto-detection drives the behaviour, then
		// restore it after each test.
		delete process.env.WRANGLER_HELP_FORMAT;

		mockDetectedType(null);
	});

	afterEach(() => {
		vi.unstubAllEnvs();
		process.env.WRANGLER_HELP_FORMAT = "human";
	});

	describe("detection gating", () => {
		it("renders Markdown for autonomous agents", async ({ expect }) => {
			mockDetectedType("agent");
			await runWrangler("kv --help");
			expect(std.out).toContain("# wrangler kv");
			expect(std.out).toContain("**Global flags**");
		});

		it("renders Markdown for hybrid environments", async ({ expect }) => {
			mockDetectedType("hybrid");
			await runWrangler("kv --help");
			expect(std.out).toContain("# wrangler kv");
		});

		it("keeps the human output for interactive environments", async ({
			expect,
		}) => {
			mockDetectedType("interactive");
			await runWrangler("kv --help");
			expect(std.out).toContain("COMMANDS");
			expect(std.out).not.toContain("**Global flags**");
		});

		it("keeps the human output when no agent is detected", async ({
			expect,
		}) => {
			mockDetectedType(null);
			await runWrangler("kv --help");
			expect(std.out).toContain("COMMANDS");
			expect(std.out).not.toContain("**Global flags**");
		});
	});

	describe("WRANGLER_HELP_FORMAT override", () => {
		it("forces Markdown when set to agent, even without detection", async ({
			expect,
		}) => {
			vi.stubEnv("WRANGLER_HELP_FORMAT", "agent");
			mockDetectedType(null);
			await runWrangler("kv --help");
			expect(std.out).toContain("# wrangler kv");
			expect(std.out).toContain("**Global flags**");
		});

		it("forces the human output when set to human, even for an agent", async ({
			expect,
		}) => {
			vi.stubEnv("WRANGLER_HELP_FORMAT", "human");
			mockDetectedType("agent");
			await runWrangler("kv --help");
			expect(std.out).toContain("COMMANDS");
			expect(std.out).not.toContain("**Global flags**");
		});
	});

	describe("rendered output", () => {
		beforeEach(() => {
			vi.stubEnv("WRANGLER_HELP_FORMAT", "agent");
		});

		it("renders a leaf command with usage, positionals, options and global flags", async ({
			expect,
		}) => {
			await runWrangler("kv key get --help");
			expect(std.out).toMatchInlineSnapshot(`
				"# wrangler kv key get

				Read a single value by key from the given namespace

				**Usage**

				\`\`\`
				wrangler kv key get <key> [options]
				\`\`\`

				**Positionals**

				- \`<key>\` (string, required) — The key value to get.

				**Options**

				- \`--text\` — Decode the returned value as a utf8 string
				- \`--binding <string>\` — The binding name to the namespace to get from
				- \`--namespace-id <string>\` — The id of the namespace to get from
				- \`--preview\` — Interact with a preview namespace
				- \`--local\` — Interact with local storage
				- \`--remote\` — Interact with remote storage
				- \`--persist-to <string>\` — Directory for local persistence

				**Global flags**

				- \`-v, --version\` — Show version number
				- \`--cwd <string>\` — Run as if Wrangler was started in the specified directory instead of the current working directory
				- \`-c, --config <string>\` — Path to Wrangler configuration file
				- \`-e, --env <string>\` — Environment to use for operations, and for selecting .env and .dev.vars files
				- \`--env-file <string...>\` — Path to an .env file to load - can be specified multiple times - values from earlier files are overridden by values in later files
				- \`--install-skills\` — Install Cloudflare skills for detected AI coding agents before running the command
				- \`--profile <string>\` — Use a specific auth profile"
			`);
		});

		it("recursively renders the whole subtree for a namespace", async ({
			expect,
		}) => {
			await runWrangler("kv --help");
			// Parent namespace heading.
			expect(std.out).toContain("# wrangler kv");
			// A grandchild leaf rendered in the same call (no drill-down needed).
			expect(std.out).toContain("### wrangler kv key get");
			expect(std.out).toContain("wrangler kv key put <key> [value] [options]");
			// Global flags rendered once at the end.
			expect(std.out).toContain("**Global flags**");
		});

		it("renders a shallow, category-grouped root", async ({ expect }) => {
			await runWrangler("--help");
			expect(std.out).toContain("# wrangler");
			expect(std.out).toContain("## Account");
			expect(std.out).toContain("## Compute & AI");
			expect(std.out).toContain("- `wrangler dev`");
			expect(std.out).toContain("**Global flags**");
			// Root stays shallow: it lists commands, not their usage blocks.
			expect(std.out).not.toContain("**Usage**");
		});

		it("resolves the nearest command when trailing positionals are present", async ({
			expect,
		}) => {
			await runWrangler("kv key get somekey --help");
			expect(std.out).toContain("# wrangler kv key get");
		});

		it("includes status labels for non-stable commands", async ({ expect }) => {
			await runWrangler("kv bulk --help");
			expect(std.out).toContain("## wrangler kv bulk get [open beta]");
		});
	});
});

describe("resolveCommandNode", () => {
	function getRoot() {
		return experimental_getWranglerCommands().registry;
	}

	it("returns the root for an empty path", ({ expect }) => {
		const { path } = resolveCommandNode(getRoot(), []);
		expect(path).toEqual([]);
	});

	it("resolves a nested command path", ({ expect }) => {
		const { path } = resolveCommandNode(getRoot(), ["kv", "key", "get"]);
		expect(path).toEqual(["kv", "key", "get"]);
	});

	it("stops at the first segment that is not a subcommand", ({ expect }) => {
		const { path } = resolveCommandNode(getRoot(), [
			"kv",
			"key",
			"get",
			"mykey",
		]);
		expect(path).toEqual(["kv", "key", "get"]);
	});

	it("resolves the nearest valid ancestor for an unknown subcommand", ({
		expect,
	}) => {
		const { path } = resolveCommandNode(getRoot(), ["kv", "bogus"]);
		expect(path).toEqual(["kv"]);
	});

	it("returns the root for an unknown top-level command", ({ expect }) => {
		const { path } = resolveCommandNode(getRoot(), ["totally-unknown"]);
		expect(path).toEqual([]);
	});
});
