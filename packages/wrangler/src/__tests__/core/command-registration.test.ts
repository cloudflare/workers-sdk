import assert from "assert";
import { CommandRegistry } from "../../core/CommandRegistry";
import {
	createAlias,
	createCommand,
	createNamespace,
} from "../../core/create-command";
import {
	HandlerContext,
	InternalDefinition,
	isAliasInternalDefinition,
	Metadata,
} from "../../core/types";

describe("CommandRegistry", () => {
	let registry: CommandRegistry;

	beforeEach(() => {
		// Create a new CommandRegistry instance before each test
		registry = new CommandRegistry(
			(
				segment: string,
				def: InternalDefinition,
				registerSubTreeCallback: () => void
			) => {
				// Mock the register command function (in a real scenario, this would call something like `yargs.command`)
				registerSubTreeCallback();
			}
		);
	});

	test("can define a command", () => {
		registry.define([
			{
				command: "wrangler my-test-command",
				definition: createCommand({
					metadata: {
						description: "My test command",
						owner: "Workers: Authoring and Testing",
						status: "stable",
					},
					args: {
						str: { type: "string", demandOption: true },
						num: { type: "number", demandOption: true },
					},
					handler: (args, ctx: HandlerContext) => {
						ctx.logger.log("Ran my-test-command");
					},
				}),
			},
		]);

		// Check internal state of the registry for the command
		const node = registry
			.getDefinitionTreeRoot()
			.subtree.get("my-test-command");
		expect(node?.definition?.command).toBe("wrangler my-test-command");
	});

	test("throws on duplicate command definition", () => {
		// @ts-expect-error missing command definition
		const definition = createCommand({
			handler: () => {},
		});

		registry.define([
			{
				command: "wrangler my-test-command",
				definition,
			},
		]);

		expect(() => {
			registry.define([
				{
					command: "wrangler my-test-command",
					definition,
				},
			]);
		}).toThrowErrorMatchingInlineSnapshot(
			`[Error: Duplicate definition for "wrangler my-test-command"]`
		);
	});

	test("can define a namespace", () => {
		const definition = createNamespace({
			// @ts-expect-error missing metadata
			metadata: {
				status: "stable",
			},
		});

		registry.define([
			{
				command: "wrangler one",
				definition,
			},
		]);

		registry.registerAll();

		const node = registry.getDefinitionTreeRoot().subtree.get("one");
		expect(node?.definition?.command).toBe("wrangler one");
	});

	test("can alias a command", () => {
		const definition = createCommand({
			// @ts-expect-error missing metadata
			metadata: {
				status: "stable",
			},
		});

		registry.define([
			{
				command: "wrangler my-test-command",
				definition,
			},
			{
				command: "wrangler my-test-alias",
				aliasOf: "wrangler my-test-command",
				definition: createAlias({
					metadata: {
						status: "stable",
					},
				}),
			},
		]);

		registry.registerAll();

		const aliasNode = registry
			.getDefinitionTreeRoot()
			.subtree.get("my-test-alias");

		const def = aliasNode?.definition;
		assert(isAliasInternalDefinition(def));

		expect(def.aliasOf).toBe("wrangler my-test-command");
	});

	test("throws on alias to undefined command", () => {
		registry.define([
			{
				command: "wrangler my-alias-command",
				aliasOf: "wrangler undefined-command",
			},
		]);

		expect(() => registry.registerAll()).toThrowErrorMatchingInlineSnapshot(
			`[Error: Missing definition for "wrangler undefined-command" (resolving from "wrangler my-alias-command")]`
		);
	});

	test("throws on missing namespace definition", () => {
		registry.define([
			{
				command: "wrangler known-namespace",
				definition: createCommand(
					// @ts-expect-error missing definition
					{}
				),
			},
			{
				command: "wrangler missing-namespace subcommand",
				definition: createCommand(
					// @ts-expect-error missing definition
					{}
				),
			},
		]);

		expect(() =>
			registry.registerNamespace("missing-namespace")
		).toThrowErrorMatchingInlineSnapshot(
			`[Error: Missing namespace definition for 'wrangler missing-namespace']`
		);
	});

	test("correctly resolves definition chain for alias", () => {
		registry.define([
			{
				command: "wrangler original-command",
				definition: createCommand(
					// @ts-expect-error missing definition
					{}
				),
			},
			{
				command: "wrangler alias-command",
				aliasOf: "wrangler original-command",
			},
		]);

		const aliasNode = registry
			.getDefinitionTreeRoot()
			.subtree.get("alias-command");

		const def = aliasNode?.definition;
		assert(isAliasInternalDefinition(def));

		expect(def.aliasOf).toBe("wrangler original-command");
	});

	test("can resolve a command definition with its metadata", () => {
		const commandMetadata: Metadata = {
			description: "Test command",
			status: "stable",
			owner: "Workers: Authoring and Testing",
		};

		registry.define([
			{
				command: "wrangler test-command",
				// @ts-expect-error missing handler
				definition: createCommand({
					metadata: commandMetadata,
				}),
			},
		]);

		registry.registerAll();

		const node = registry.getDefinitionTreeRoot().subtree.get("test-command");
		expect(node?.definition?.metadata).toEqual(commandMetadata);
	});

	test("correctly resolves multiple alias chains", () => {
		registry.define([
			{
				command: "wrangler original-command",
				definition: createCommand(
					// @ts-expect-error missing definition
					{}
				),
			},
			{
				command: "wrangler alias-command-1",
				aliasOf: "wrangler original-command",
			},
			{
				command: "wrangler alias-command-2",
				aliasOf: "wrangler alias-command-1",
			},
		]);

		registry.registerAll();

		const aliasNode = registry
			.getDefinitionTreeRoot()
			.subtree.get("alias-command-2");

		const def = aliasNode?.definition;
		assert(isAliasInternalDefinition(def));

		expect(def.aliasOf).toBe("wrangler alias-command-1");
	});

	test("throws on invalid namespace resolution (namespace not defined)", () => {
		registry.define([
			{
				command: "wrangler invalid-namespace subcommand",
				definition: createCommand(
					// @ts-expect-error missing definition
					{}
				),
			},
		]);

		expect(() =>
			registry.registerNamespace("invalid-namespace")
		).toThrowErrorMatchingInlineSnapshot(
			`[Error: Missing namespace definition for 'wrangler invalid-namespace']`
		);
	});
});
