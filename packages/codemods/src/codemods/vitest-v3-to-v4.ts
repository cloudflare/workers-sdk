/**
 * Migrates @cloudflare/vitest-pool-workers configuration from Vitest v3 to v4.
 *
 * Transforms a `defineWorkersProject({ test: { poolOptions: { workers } } })`
 * or `defineWorkersConfig(...)` config into
 * `defineConfig({ plugins: [cloudflareTest(workers)], test })`, rewriting the
 * relevant imports.
 */
import { parseTs, print, types } from "@cloudflare/shared-ast-primitives";

const b = types.builders;
const n = types.namedTypes;
const { visit } = types;

type Node = types.ASTNode;
type ObjectExpression = types.namedTypes.ObjectExpression;
type ObjectProperty = types.namedTypes.ObjectProperty;
type Property = types.namedTypes.Property;
type ImportDeclaration = types.namedTypes.ImportDeclaration;
type NamedProp = ObjectProperty | Property;

const CONFIG_HELPERS = ["defineWorkersConfig", "defineWorkersProject"];
const CONFIG_PACKAGES = [
	"@cloudflare/vitest-plugin",
	"@cloudflare/vitest-pool-workers",
];

/** Returns whether an AST property has the requested identifier key. */
function isNamedProp(prop: Node, name: string): prop is NamedProp {
	return (
		(n.ObjectProperty.check(prop) || n.Property.check(prop)) &&
		n.Identifier.check(prop.key) &&
		prop.key.name === name
	);
}

/** Finds an AST property by identifier key. */
function findNamedProp(
	properties: Node[],
	name: string
): NamedProp | undefined {
	return properties.find((prop): prop is NamedProp => isNamedProp(prop, name));
}

/** Finds a named import specifier on an import declaration. */
function importSpecifierNamed(imp: ImportDeclaration, imported: string) {
	return (imp.specifiers ?? []).find(
		(candidate) =>
			n.ImportSpecifier.check(candidate) &&
			n.Identifier.check(candidate.imported) &&
			candidate.imported.name === imported
	);
}

/** Migrates a Workers Vitest v3 configuration source to the v4 plugin API. */
export default function transform(source: string): string {
	const ast = parseTs(source);
	const body = ast.program.body;

	const importDeclarations = body.filter((node): node is ImportDeclaration =>
		n.ImportDeclaration.check(node)
	);

	const configImports = importDeclarations.flatMap((imp) =>
		CONFIG_PACKAGES.flatMap((packageName) =>
			n.StringLiteral.check(imp.source) &&
			imp.source.value === `${packageName}/config`
				? [{ imp, packageName }]
				: []
		)
	);

	const matchingImports = configImports.flatMap(({ imp, packageName }) =>
		CONFIG_HELPERS.flatMap((helperName) => {
			const specifier = importSpecifierNamed(imp, helperName);
			if (!specifier || !n.ImportSpecifier.check(specifier)) {
				return [];
			}
			const localName = n.Identifier.check(specifier.local)
				? specifier.local.name
				: helperName;

			// Collect matching call expressions across the whole tree.
			const calls: types.namedTypes.CallExpression[] = [];
			visit(ast, {
				visitCallExpression(path) {
					const callee = path.node.callee;
					if (n.Identifier.check(callee) && callee.name === localName) {
						calls.push(path.node);
					}
					this.traverse(path);
				},
			});

			return calls.length === 0
				? []
				: [{ imp, packageName, helperName, localName, calls }];
		})
	);

	if (matchingImports.length === 0) {
		return source;
	}
	if (matchingImports.length > 1) {
		throw new Error("Multiple Workers config helpers are not supported");
	}

	const [{ imp: configImport, packageName, helperName, localName, calls }] =
		matchingImports;

	// Resolve the local name for `cloudflareTest`, importing it if absent.
	const rootPackageImports = importDeclarations.filter(
		(imp) =>
			n.StringLiteral.check(imp.source) && imp.source.value === packageName
	);
	let cloudflareTestName: string | undefined;
	for (const imp of rootPackageImports) {
		const specifier = importSpecifierNamed(imp, "cloudflareTest");
		if (specifier && n.ImportSpecifier.check(specifier)) {
			cloudflareTestName = n.Identifier.check(specifier.local)
				? specifier.local.name
				: "cloudflareTest";
			break;
		}
	}

	if (!cloudflareTestName) {
		cloudflareTestName = "cloudflareTest";
		configImport.specifiers = [
			b.importSpecifier(b.identifier(cloudflareTestName)),
			...(configImport.specifiers ?? []),
		];
	}
	configImport.source = b.stringLiteral(packageName);
	configImport.specifiers = (configImport.specifiers ?? []).filter(
		(specifier) =>
			!(
				n.ImportSpecifier.check(specifier) &&
				n.Identifier.check(specifier.imported) &&
				specifier.imported.name === helperName
			)
	);

	// Resolve `defineConfig`, reusing the helper from Vite or Vitest if present.
	const defineConfigImports = importDeclarations.filter(
		(imp) =>
			n.StringLiteral.check(imp.source) &&
			(imp.source.value === "vitest/config" || imp.source.value === "vite")
	);
	let defineConfigName = "defineConfig";
	let hasDefineConfigImport = false;
	for (const imp of defineConfigImports) {
		const specifier = importSpecifierNamed(imp, "defineConfig");
		if (specifier && n.ImportSpecifier.check(specifier)) {
			defineConfigName = n.Identifier.check(specifier.local)
				? specifier.local.name
				: "defineConfig";
			hasDefineConfigImport = true;
			break;
		}
	}

	if (!hasDefineConfigImport) {
		const target = defineConfigImports.find(
			(imp) =>
				n.StringLiteral.check(imp.source) &&
				imp.source.value === "vitest/config"
		);
		if (target) {
			target.specifiers = [
				...(target.specifiers ?? []),
				b.importSpecifier(b.identifier(defineConfigName)),
			];
		} else {
			const lastImportIndex = body.reduce(
				(acc, node, index) => (n.ImportDeclaration.check(node) ? index : acc),
				-1
			);
			body.splice(
				lastImportIndex + 1,
				0,
				b.importDeclaration(
					[b.importSpecifier(b.identifier(defineConfigName))],
					b.stringLiteral("vitest/config")
				)
			);
		}
	}

	for (const call of calls) {
		if (!n.Identifier.check(call.callee) || call.callee.name !== localName) {
			continue;
		}
		call.callee.name = defineConfigName;

		const config = call.arguments[0];
		if (!n.ObjectExpression.check(config)) {
			throw new Error(
				`${helperName}() is called with a function and not an object, ` +
					"and so is too complex to apply a codemod to. " +
					"Please refer to the migration docs to perform the migration manually."
			);
		}

		const testProp = findNamedProp(config.properties, "test");
		if (!testProp || !n.ObjectExpression.check(testProp.value)) {
			throw new Error("Could not find `test` property in config");
		}
		const testObj: ObjectExpression = testProp.value;

		const poolOptionsProp = findNamedProp(testObj.properties, "poolOptions");
		if (!poolOptionsProp || !n.ObjectExpression.check(poolOptionsProp.value)) {
			throw new Error("Could not find `test.poolOptions` property in config");
		}
		const poolOptionsObj: ObjectExpression = poolOptionsProp.value;

		const workersProp = findNamedProp(poolOptionsObj.properties, "workers");
		if (
			!workersProp ||
			!(
				n.ObjectExpression.check(workersProp.value) ||
				n.FunctionExpression.check(workersProp.value) ||
				n.ArrowFunctionExpression.check(workersProp.value)
			)
		) {
			throw new Error(
				"Could not find `test.poolOptions.workers` property in config"
			);
		}

		const pluginCall = b.callExpression(b.identifier(cloudflareTestName), [
			workersProp.value,
		]);
		const pluginsProp = findNamedProp(config.properties, "plugins");
		if (pluginsProp && n.ArrayExpression.check(pluginsProp.value)) {
			pluginsProp.value.elements.unshift(pluginCall);
		} else if (pluginsProp) {
			throw new Error(
				"`plugins` is not an inline array and so is too complex to apply a codemod to. " +
					"Please refer to the migration docs to perform the migration manually."
			);
		} else {
			config.properties.unshift(
				b.objectProperty(
					b.identifier("plugins"),
					b.arrayExpression([pluginCall])
				)
			);
		}

		testObj.properties = testObj.properties.filter(
			(prop) => !isNamedProp(prop, "poolOptions")
		) as ObjectExpression["properties"];
	}

	return print(ast).code;
}
