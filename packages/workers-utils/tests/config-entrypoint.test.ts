/* eslint-disable @typescript-eslint/no-deprecated -- Verify that deprecated compatibility exports remain usable. */
import assert from "node:assert";
import { fileURLToPath } from "node:url";
import * as legacy from "@cloudflare/workers-utils";
import * as config from "@cloudflare/workers-utils/config";
import ts from "typescript";
import { expectTypeOf, test } from "vitest";

test("published config entry points share runtime values", ({ expect }) => {
	for (const [name, value] of Object.entries(config)) {
		if (name === "readConfig") {
			expect(value).toBeTypeOf("function");
			expect(legacy).not.toHaveProperty(name);
			continue;
		}
		expect(legacy, name).toHaveProperty(name, value);
		expect(Reflect.get(legacy, name), name).toBe(value);
	}

	expect(new legacy.Diagnostics("test")).toBeInstanceOf(config.Diagnostics);
	expect(new config.PatchConfigError("test")).toBeInstanceOf(
		legacy.PatchConfigError
	);
});

test("legacy types and generic functions retain their signatures", () => {
	expectTypeOf<legacy.Config>().toEqualTypeOf<config.Config>();
	expectTypeOf<legacy.RawConfig>().toEqualTypeOf<config.RawConfig>();
	expectTypeOf<legacy.ConfigFields<legacy.RawDevConfig>>().toEqualTypeOf<
		config.ConfigFields<config.RawDevConfig>
	>();
	expectTypeOf<legacy.Diagnostics>().toEqualTypeOf<config.Diagnostics>();
	expectTypeOf<legacy.PatchConfigError>().toEqualTypeOf<config.PatchConfigError>();
	expectTypeOf(legacy.extractBindingsOfType).toEqualTypeOf(
		config.extractBindingsOfType
	);
});

test("published declarations deprecate root config imports only", ({
	expect,
}) => {
	const rootPath = fileURLToPath(
		new URL("../dist/index.d.mts", import.meta.url)
	);
	const configPath = fileURLToPath(
		new URL("../dist/config/public.d.mts", import.meta.url)
	);
	const program = ts.createProgram([rootPath, configPath], {
		module: ts.ModuleKind.NodeNext,
		moduleResolution: ts.ModuleResolutionKind.NodeNext,
		skipLibCheck: true,
		types: [],
	});
	const checker = program.getTypeChecker();

	function getExports(path: string) {
		const source = program.getSourceFile(path);
		assert(source);
		const module = checker.getSymbolAtLocation(source);
		assert(module);
		return new Map(
			checker.getExportsOfModule(module).map((symbol) => {
				if (symbol.flags & ts.SymbolFlags.Alias) {
					return [symbol.name, checker.getAliasedSymbol(symbol)];
				}
				return [symbol.name, symbol];
			})
		);
	}

	const rootExports = getExports(rootPath);
	const configExports = getExports(configPath);
	for (const [name, symbol] of configExports) {
		const rootSymbol = rootExports.get(name);
		if (rootSymbol) {
			expect(rootSymbol.getJsDocTags(checker), name).toContainEqual(
				expect.objectContaining({ name: "deprecated" })
			);
		}
		expect(symbol.getJsDocTags(checker), name).not.toContainEqual(
			expect.objectContaining({ name: "deprecated" })
		);
	}
});
