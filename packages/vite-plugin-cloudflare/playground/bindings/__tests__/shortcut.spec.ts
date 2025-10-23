import path from "node:path";
import { expect, test, vi } from "vitest";
import { resetServerLogs, serverLogs, viteServer } from "../../__test-utils__";
import { addBindingsShortcut } from "../../../src/bindings";
import { resolvePluginConfig } from "../../../src/plugin-config";
import { PluginContext } from "../../../src/plugins/utils";

test("display bindings shortcut by default", () => {
	viteServer.bindCLIShortcuts({ print: true });

	expect(serverLogs.info.join("\n")).toMatch(
		"press b + enter to list worker bindings"
	);
});

test("prints bindings with single worker", () => {
	// Create a test server with a spy on bindCLIShortcuts
	const mockBindCLIShortcuts = vi.spyOn(viteServer, "bindCLIShortcuts");
	// Create mock plugin context
	const mockContext = new PluginContext();

	mockContext.setResolvedPluginConfig(
		resolvePluginConfig(
			{
				configPath: path.resolve(__dirname, "../wrangler.jsonc"),
			},
			{},
			{
				command: "serve",
				mode: "development",
			}
		)
	);

	addBindingsShortcut(viteServer, mockContext);
	// Confirm that addBindingsShortcut wrapped the original method
	expect(viteServer.bindCLIShortcuts).not.toBe(mockBindCLIShortcuts);

	// Verify the original was called with our custom shortcut
	viteServer.bindCLIShortcuts({ print: true });
	expect(mockBindCLIShortcuts).toHaveBeenCalledExactlyOnceWith({
		print: true,
		customShortcuts: [
			{
				key: "b",
				description: "list worker bindings",
				action: expect.any(Function),
			},
		],
	});

	const { customShortcuts } = mockBindCLIShortcuts.mock.calls[0]?.[0] ?? {};
	const printBindingShortcut = customShortcuts?.find((s) => s.key === "b");

	resetServerLogs();

	printBindingShortcut?.action?.(viteServer as any);

	expect(
		serverLogs.info
			.flatMap((msg) => msg.split("\n").map((line) => line.trim()))
			.join("\n")
	).toMatchInlineSnapshot(`
		"
		Your Worker has access to the following bindings:
		Binding                                    Resource
		env.KV (test-kv-id)                        KV Namespace
		env.HYPERDRIVE (test-hyperdrive-id)        Hyperdrive Config
		env.HELLO_WORLD (Timer disabled)           Hello World
		env.WAE (test)                             Analytics Engine Dataset
		env.IMAGES                                 Images
		env.RATE_LIMITER (ratelimit)               Unsafe Metadata
		"
	`);
});

test("prints bindings action with multi workers", () => {
	// Create a test server with a spy on bindCLIShortcuts
	const mockBindCLIShortcuts = vi.spyOn(viteServer, "bindCLIShortcuts");
	// Create mock plugin context
	const mockContext = new PluginContext();

	mockContext.setResolvedPluginConfig(
		resolvePluginConfig(
			{
				configPath: path.resolve(__dirname, "../wrangler.jsonc"),
				auxiliaryWorkers: [
					{
						configPath: path.resolve(__dirname, "../wrangler.auxiliary.jsonc"),
					},
				],
			},
			{},
			{
				command: "serve",
				mode: "development",
			}
		)
	);

	addBindingsShortcut(viteServer, mockContext);
	// Confirm that addBindingsShortcut wrapped the original method
	expect(viteServer.bindCLIShortcuts).not.toBe(mockBindCLIShortcuts);

	// Verify the original was called with our custom shortcut
	viteServer.bindCLIShortcuts({ print: true });
	expect(mockBindCLIShortcuts).toHaveBeenCalledExactlyOnceWith({
		print: true,
		customShortcuts: [
			{
				key: "b",
				description: "list worker bindings",
				action: expect.any(Function),
			},
		],
	});

	const { customShortcuts } = mockBindCLIShortcuts.mock.calls[0]?.[0] ?? {};
	const printBindingShortcut = customShortcuts?.find((s) => s.key === "b");

	resetServerLogs();

	printBindingShortcut?.action?.(viteServer as any);

	expect(
		serverLogs.info
			.flatMap((msg) => msg.split("\n").map((line) => line.trim()))
			.join("\n")
	).toMatchInlineSnapshot(`
		"
		worker has access to the following bindings:
		Binding                                    Resource
		env.KV (test-kv-id)                        KV Namespace
		env.HYPERDRIVE (test-hyperdrive-id)        Hyperdrive Config
		env.HELLO_WORLD (Timer disabled)           Hello World
		env.WAE (test)                             Analytics Engine Dataset
		env.IMAGES                                 Images
		env.RATE_LIMITER (ratelimit)               Unsafe Metadata

		auxiliary-worker has access to the following bindings:
		Binding                   Resource
		env.SERVICE (worker)      Worker
		"
	`);
});
