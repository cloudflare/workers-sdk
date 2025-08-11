import { describe, expect, test } from "vitest";
import { experimental_getWranglerCommands } from "../experimental-commands-api";

function serializeCommandTree(tree: unknown): unknown {
	if (tree instanceof Map) {
		const obj: Record<string, unknown> = {};
		for (const [key, value] of tree.entries()) {
			obj[key] = serializeCommandTree(value);
		}
		return obj;
	}

	if (tree && typeof tree === "object") {
		const serialized: Record<string, unknown> = {};
		for (const [key, value] of Object.entries(tree)) {
			serialized[key] = serializeCommandTree(value);
		}
		return serialized;
	}

	return tree;
}

describe("experimental_getWranglerCommands", () => {
	test("returns complete command tree structure", () => {
		const commandTree = experimental_getWranglerCommands();
		const serializedTree = serializeCommandTree(commandTree);

		expect(JSON.stringify(serializedTree, null, 2)).toMatchSnapshot();
	});

	test("includes expected core commands", () => {
		const commandTree = experimental_getWranglerCommands();

		expect(commandTree.subtree.has("docs")).toBe(true);
		expect(commandTree.subtree.has("init")).toBe(true);
		expect(commandTree.subtree.has("dev")).toBe(true);
		expect(commandTree.subtree.has("deploy")).toBe(true);
	});

	test("includes nested command structures", () => {
		const commandTree = experimental_getWranglerCommands();

		const d1Command = commandTree.subtree.get("d1");
		expect(d1Command?.subtree).toBeInstanceOf(Map);
		expect(d1Command?.subtree.has("list")).toBe(true);
		expect(d1Command?.subtree.has("create")).toBe(true);
		expect(d1Command?.subtree.has("delete")).toBe(true);

		const kvCommand = commandTree.subtree.get("kv");
		expect(kvCommand?.definition?.type).toBe("namespace");
		expect(kvCommand?.subtree).toBeInstanceOf(Map);
		expect(kvCommand?.subtree.has("namespace")).toBe(true);
		expect(kvCommand?.subtree.has("key")).toBe(true);
	});

	test("preserves command metadata structure", () => {
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
