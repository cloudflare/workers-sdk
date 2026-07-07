import { assert, describe, test } from "vitest";
import { experimental_getWranglerCommands } from "../experimental-commands-api";
import type { DefinitionTreeNode } from "../core/types";

describe("experimental_getWranglerCommands", () => {
	test("returns global flags", ({ expect }) => {
		const commandTree = experimental_getWranglerCommands().globalFlags;

		expect(commandTree).toMatchInlineSnapshot(`
			{
			  "config": {
			    "alias": "c",
			    "describe": "Path to Wrangler configuration file",
			    "requiresArg": true,
			    "type": "string",
			  },
			  "cwd": {
			    "describe": "Run as if Wrangler was started in the specified directory instead of the current working directory",
			    "requiresArg": true,
			    "type": "string",
			  },
			  "env": {
			    "alias": "e",
			    "describe": "Environment to use for operations, and for selecting .env and .dev.vars files",
			    "requiresArg": true,
			    "type": "string",
			  },
			  "env-file": {
			    "array": true,
			    "describe": "Path to an .env file to load - can be specified multiple times - values from earlier files are overridden by values in later files",
			    "requiresArg": true,
			    "type": "string",
			  },
			  "experimental-auto-create": {
			    "alias": "x-auto-create",
			    "default": true,
			    "describe": "Automatically provision draft bindings with new resources",
			    "hidden": true,
			    "type": "boolean",
			  },
			  "experimental-provision": {
			    "alias": [
			      "x-provision",
			    ],
			    "default": true,
			    "describe": "Experimental: Enable automatic resource provisioning",
			    "hidden": true,
			    "type": "boolean",
			  },
			  "install-skills": {
			    "default": false,
			    "describe": "Install Cloudflare skills for detected AI coding agents before running the command",
			    "type": "boolean",
			  },
			  "profile": {
			    "describe": "Use a specific auth profile",
			    "requiresArg": true,
			    "type": "string",
			  },
			  "v": {
			    "alias": "version",
			    "describe": "Show version number",
			    "type": "boolean",
			  },
			}
		`);
	});
	test("returns command tree structure", ({ expect }) => {
		const commandTree = experimental_getWranglerCommands().registry;

		expect(commandTree).toBeDefined();
		expect(commandTree.subtree).toBeInstanceOf(Map);
	});

	test("includes expected commands with metadata", ({ expect }) => {
		const commandTree = experimental_getWranglerCommands().registry;

		expect(commandTree.subtree.has("docs")).toBe(true);
		expect(commandTree.subtree.has("init")).toBe(true);
		expect(commandTree.subtree.has("dev")).toBe(true);
		expect(commandTree.subtree.has("deploy")).toBe(true);

		const docsCommand = commandTree.subtree.get("docs");
		assert(docsCommand?.definition);
		expect(docsCommand.definition.metadata).toBeDefined();
		expect(docsCommand.definition.metadata?.description).toBeDefined();
		expect(docsCommand.definition.metadata?.status).toBeDefined();
	});

	test("includes nested commands", ({ expect }) => {
		const commandTree = experimental_getWranglerCommands().registry;

		const d1Command = commandTree.subtree.get("d1");
		assert(d1Command);
		expect(d1Command.subtree).toBeInstanceOf(Map);
		expect(d1Command.subtree.has("list")).toBe(true);
		expect(d1Command.subtree.has("create")).toBe(true);
		expect(d1Command.subtree.has("delete")).toBe(true);
	});

	test("includes command arguments and metadata", ({ expect }) => {
		const commandTree = experimental_getWranglerCommands().registry;

		const initCommand = commandTree.subtree.get("init");
		assert(initCommand?.definition?.type === "command");
		expect(initCommand.definition.metadata).toBeDefined();
		expect(initCommand.definition.metadata.description).toBeDefined();
		expect(initCommand.definition.metadata.status).toBeDefined();
		expect(initCommand.definition.metadata.owner).toBeDefined();
	});

	test("includes namespace commands", ({ expect }) => {
		const commandTree = experimental_getWranglerCommands().registry;

		const kvCommand = commandTree.subtree.get("kv");
		assert(kvCommand?.definition?.type === "namespace");
		expect(kvCommand.subtree).toBeInstanceOf(Map);
		expect(kvCommand.subtree.has("namespace")).toBe(true);
		expect(kvCommand.subtree.has("key")).toBe(true);
	});

	test("preserves command metadata properties", ({ expect }) => {
		const commandTree = experimental_getWranglerCommands().registry;

		const deployCommand = commandTree.subtree.get("deploy");
		assert(deployCommand?.definition?.type === "command");
		const metadata = deployCommand.definition.metadata;
		expect(metadata.description).toBeDefined();
		expect(metadata.status).toBeDefined();
		expect(metadata.owner).toBeDefined();
		expect(typeof metadata.description).toBe("string");
		expect([
			"experimental",
			"alpha",
			"private beta",
			"open beta",
			"stable",
		]).toContain(metadata.status);
	});

	test("commands opting in to `--temporary` match the expected set", ({
		expect,
	}) => {
		const supporting: string[] = [];
		const walk = (node: DefinitionTreeNode) => {
			if (
				node.definition?.type === "command" &&
				node.definition.behaviour?.supportTemporary
			) {
				supporting.push(node.definition.command);
			}
			for (const child of node.subtree.values()) {
				walk(child);
			}
		};
		walk(experimental_getWranglerCommands().registry);

		expect(supporting.sort()).toMatchInlineSnapshot(`
			[
			  "wrangler cert delete",
			  "wrangler cert list",
			  "wrangler cert upload certificate-authority",
			  "wrangler cert upload mtls-certificate",
			  "wrangler d1 create",
			  "wrangler d1 delete",
			  "wrangler d1 execute",
			  "wrangler d1 export",
			  "wrangler d1 info",
			  "wrangler d1 insights",
			  "wrangler d1 list",
			  "wrangler d1 migrations apply",
			  "wrangler d1 migrations create",
			  "wrangler d1 migrations list",
			  "wrangler d1 time-travel info",
			  "wrangler d1 time-travel restore",
			  "wrangler delete",
			  "wrangler deploy",
			  "wrangler deployments list",
			  "wrangler deployments status",
			  "wrangler deployments view",
			  "wrangler hyperdrive create",
			  "wrangler hyperdrive delete",
			  "wrangler hyperdrive get",
			  "wrangler hyperdrive list",
			  "wrangler hyperdrive update",
			  "wrangler kv bulk delete",
			  "wrangler kv bulk get",
			  "wrangler kv bulk put",
			  "wrangler kv key delete",
			  "wrangler kv key get",
			  "wrangler kv key list",
			  "wrangler kv key put",
			  "wrangler kv namespace create",
			  "wrangler kv namespace delete",
			  "wrangler kv namespace list",
			  "wrangler kv namespace rename",
			  "wrangler queues consumer add",
			  "wrangler queues consumer http add",
			  "wrangler queues consumer http list",
			  "wrangler queues consumer http remove",
			  "wrangler queues consumer list",
			  "wrangler queues consumer remove",
			  "wrangler queues consumer worker add",
			  "wrangler queues consumer worker list",
			  "wrangler queues consumer worker remove",
			  "wrangler queues create",
			  "wrangler queues delete",
			  "wrangler queues info",
			  "wrangler queues list",
			  "wrangler queues pause-delivery",
			  "wrangler queues purge",
			  "wrangler queues resume-delivery",
			  "wrangler queues subscription create",
			  "wrangler queues subscription delete",
			  "wrangler queues subscription get",
			  "wrangler queues subscription list",
			  "wrangler queues subscription update",
			  "wrangler queues update",
			  "wrangler rollback",
			  "wrangler secret bulk",
			  "wrangler secret delete",
			  "wrangler secret list",
			  "wrangler secret put",
			  "wrangler tail",
			  "wrangler triggers deploy",
			  "wrangler versions deploy",
			  "wrangler versions list",
			  "wrangler versions secret bulk",
			  "wrangler versions secret delete",
			  "wrangler versions secret list",
			  "wrangler versions secret put",
			  "wrangler versions upload",
			  "wrangler versions view",
			]
		`);
	});
});
