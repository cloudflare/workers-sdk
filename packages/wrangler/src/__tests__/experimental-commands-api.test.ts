import { describe, expect, test } from "vitest";
import { experimental_getWranglerCommands } from "../experimental-commands-api";

describe("experimental_getWranglerCommands", () => {
	test("returns command tree structure", () => {
		const commandTree = experimental_getWranglerCommands();

		expect(commandTree).toBeDefined();
		expect(commandTree.subtree).toBeInstanceOf(Map);
	});

	test("includes expected commands with metadata", () => {
		const commandTree = experimental_getWranglerCommands();

		expect(commandTree.subtree.has("docs")).toBe(true);
		expect(commandTree.subtree.has("init")).toBe(true);
		expect(commandTree.subtree.has("dev")).toBe(true);
		expect(commandTree.subtree.has("deploy")).toBe(true);

		const docsCommand = commandTree.subtree.get("docs");
		expect(docsCommand?.definition?.metadata).toBeDefined();
		expect(docsCommand?.definition?.metadata?.description).toBeDefined();
		expect(docsCommand?.definition?.metadata?.status).toBeDefined();
	});

	test("includes nested commands", () => {
		const commandTree = experimental_getWranglerCommands();

		const d1Command = commandTree.subtree.get("d1");
		expect(d1Command?.subtree).toBeInstanceOf(Map);
		expect(d1Command?.subtree.has("list")).toBe(true);
		expect(d1Command?.subtree.has("create")).toBe(true);
		expect(d1Command?.subtree.has("delete")).toBe(true);
	});

	test("includes command arguments and metadata", () => {
		const commandTree = experimental_getWranglerCommands();

		const initCommand = commandTree.subtree.get("init");
		expect(initCommand?.definition?.type).toBe("command");
		if (initCommand?.definition?.type === "command") {
			expect(initCommand.definition.metadata).toBeDefined();
			expect(initCommand.definition.metadata.description).toBeDefined();
			expect(initCommand.definition.metadata.status).toBeDefined();
			expect(initCommand.definition.metadata.owner).toBeDefined();
		}
	});

	test("includes namespace commands", () => {
		const commandTree = experimental_getWranglerCommands();

		const kvCommand = commandTree.subtree.get("kv");
		expect(kvCommand?.definition?.type).toBe("namespace");
		expect(kvCommand?.subtree).toBeInstanceOf(Map);
		expect(kvCommand?.subtree.has("namespace")).toBe(true);
		expect(kvCommand?.subtree.has("key")).toBe(true);
	});

	test("preserves command metadata properties", () => {
		const commandTree = experimental_getWranglerCommands();

		const deployCommand = commandTree.subtree.get("deploy");
		if (deployCommand?.definition?.type === "command") {
			const metadata = deployCommand.definition.metadata;
			expect(metadata.description).toBeDefined();
			expect(metadata.status).toBeDefined();
			expect(metadata.owner).toBeDefined();
			expect(typeof metadata.description).toBe("string");
			expect([
				"experimental",
				"alpha",
				"private-beta",
				"open-beta",
				"stable",
			]).toContain(metadata.status);
		}
	});
});
