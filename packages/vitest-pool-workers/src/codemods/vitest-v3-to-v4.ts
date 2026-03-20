/**
 * jscodeshift codemod: migrate @cloudflare/vitest-pool-workers config from v3 to v4.
 *
 * Transforms:
 *   import { defineWorkersProject } from "@cloudflare/vitest-pool-workers/config";
 *   export default defineWorkersProject({ test: { poolOptions: { workers: { ... } } } });
 *
 * Into:
 *   import { cloudflareTest } from "@cloudflare/vitest-pool-workers";
 *   import { defineConfig } from "vitest/config";
 *   export default defineConfig({ plugins: [cloudflareTest({ ... })], test: { ... } });
 *
 * Usage:
 *   npx jscodeshift -t node_modules/@cloudflare/vitest-pool-workers/dist/codemods/vitest-v3-to-v4.mjs vitest.config.ts
 */

// Minimal jscodeshift types — avoids requiring @types/jscodeshift as a dependency.
interface FileInfo {
	path: string;
	source: string;
}
interface JSCodeshift {
	(source: string): Collection;
	ImportDeclaration: ASTType;
	CallExpression: ASTType;
	ObjectExpression: { check(node: unknown): node is ObjectExpressionNode };
	ObjectProperty: { check(node: unknown): node is PropertyNode };
	Property: { check(node: unknown): node is PropertyNode };
	Identifier: { check(node: unknown): node is IdentifierNode };
	FunctionExpression: { check(node: unknown): boolean };
	ArrowFunctionExpression: { check(node: unknown): boolean };
	ArrayExpression: { check(node: unknown): node is ArrayExpressionNode };
	importDeclaration(
		specifiers: ImportSpecifierNode[],
		source: LiteralNode
	): ImportDeclarationNode;
	importSpecifier(
		imported: IdentifierNode,
		local?: IdentifierNode
	): ImportSpecifierNode;
	identifier(name: string): IdentifierNode;
	stringLiteral(value: string): LiteralNode;
	callExpression(
		callee: IdentifierNode,
		args: ExpressionNode[]
	): CallExpressionNode;
	arrayExpression(elements: ExpressionNode[]): ArrayExpressionNode;
	objectProperty(key: IdentifierNode, value: ExpressionNode): PropertyNode;
}

interface ASTType {
	name: string;
}

interface ASTNode {
	type: string;
}

interface IdentifierNode extends ASTNode {
	type: "Identifier";
	name: string;
}

interface LiteralNode extends ASTNode {
	value: string;
}

interface ImportSpecifierNode extends ASTNode {
	type: "ImportSpecifier";
	imported: IdentifierNode;
	local?: IdentifierNode;
}

interface ImportDeclarationNode extends ASTNode {
	type: "ImportDeclaration";
	source: LiteralNode;
	specifiers: ImportSpecifierNode[];
}

interface PropertyNode extends ASTNode {
	key: ASTNode;
	value: ASTNode;
}

interface ObjectExpressionNode extends ASTNode {
	type: "ObjectExpression";
	properties: PropertyNode[];
}

interface ArrayExpressionNode extends ASTNode {
	type: "ArrayExpression";
	elements: ExpressionNode[];
}

interface CallExpressionNode extends ASTNode {
	type: "CallExpression";
	callee: ASTNode;
	arguments: ASTNode[];
}

type ExpressionNode = ASTNode;

interface NodePath<T = ASTNode> {
	node: T;
	parent: NodePath;
	insertAfter(node: ASTNode): void;
}

interface Collection {
	find(type: ASTType, filter?: Record<string, unknown>): Collection;
	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	forEach(callback: (path: NodePath<any>) => void): Collection;
	at(index: number): Collection;
	paths(): NodePath[];
	length: number;
	toSource(): string;
}

interface API {
	jscodeshift: JSCodeshift;
}

function isNamedProp(
	j: JSCodeshift,
	prop: ASTNode,
	name: string
): prop is PropertyNode {
	return (
		(j.Property.check(prop) || j.ObjectProperty.check(prop)) &&
		j.Identifier.check(prop.key) &&
		(prop.key as IdentifierNode).name === name
	);
}

function findNamedProp(
	j: JSCodeshift,
	properties: PropertyNode[],
	name: string
): PropertyNode | undefined {
	return properties.find((prop) => isNamedProp(j, prop, name));
}

export default function transform(fileInfo: FileInfo, api: API): string {
	const j = api.jscodeshift;
	const root = j(fileInfo.source);

	// 1. Find the import of @cloudflare/vitest-pool-workers/config with defineWorkersProject
	const configImports = root.find(j.ImportDeclaration, {
		source: { value: "@cloudflare/vitest-pool-workers/config" },
	});

	if (configImports.length === 0) {
		// Nothing to transform
		return fileInfo.source;
	}

	// Update the import: change source and swap defineWorkersProject → cloudflareTest
	configImports.forEach((path: NodePath<ImportDeclarationNode>) => {
		path.node.source.value = "@cloudflare/vitest-pool-workers";
		path.node.specifiers = [
			j.importSpecifier(j.identifier("cloudflareTest")),
			...(path.node.specifiers?.filter(
				(s) =>
					!(
						s.type === "ImportSpecifier" &&
						s.imported?.name === "defineWorkersProject"
					)
			) ?? []),
		];
	});

	// 2. Add `import { defineConfig } from "vitest/config"` after the last import
	const allImports = root.find(j.ImportDeclaration);
	if (allImports.length > 0) {
		const lastImport = allImports.at(-1);
		lastImport.forEach((path: NodePath) => {
			path.insertAfter(
				j.importDeclaration(
					[j.importSpecifier(j.identifier("defineConfig"))],
					j.stringLiteral("vitest/config")
				)
			);
		});
	}

	// 3. Transform defineWorkersProject() → defineConfig() with plugins
	root
		.find(j.CallExpression, {
			callee: { name: "defineWorkersProject" },
		})
		.forEach((path: NodePath<CallExpressionNode>) => {
			// Rename callee
			(path.node.callee as IdentifierNode).name = "defineConfig";

			const config = path.node.arguments[0];
			if (!j.ObjectExpression.check(config)) {
				throw new Error(
					"defineWorkersProject() is called with a function and not an object, " +
						"and so is too complex to apply a codemod to. " +
						"Please refer to the migration docs to perform the migration manually."
				);
			}

			// Find test.poolOptions.workers
			const testProp = findNamedProp(j, config.properties, "test");
			if (!testProp || !j.ObjectExpression.check(testProp.value)) {
				throw new Error("Could not find `test` property in config");
			}
			const testObj = testProp.value as ObjectExpressionNode;

			const poolOptionsProp = findNamedProp(
				j,
				testObj.properties,
				"poolOptions"
			);
			if (
				!poolOptionsProp ||
				!j.ObjectExpression.check(poolOptionsProp.value)
			) {
				throw new Error("Could not find `test.poolOptions` property in config");
			}
			const poolOptionsObj = poolOptionsProp.value as ObjectExpressionNode;

			const workersProp = findNamedProp(
				j,
				poolOptionsObj.properties,
				"workers"
			);
			if (
				!workersProp ||
				!(
					j.ObjectExpression.check(workersProp.value) ||
					j.FunctionExpression.check(workersProp.value) ||
					j.ArrowFunctionExpression.check(workersProp.value)
				)
			) {
				throw new Error(
					"Could not find `test.poolOptions.workers` property in config"
				);
			}

			// Create plugins: [cloudflareTest(<workers value>)]
			const pluginCall = j.callExpression(j.identifier("cloudflareTest"), [
				workersProp.value as ExpressionNode,
			]);

			const pluginsProp = findNamedProp(j, config.properties, "plugins");
			if (pluginsProp && j.ArrayExpression.check(pluginsProp.value)) {
				// Prepend to existing plugins array
				(pluginsProp.value as ArrayExpressionNode).elements.unshift(pluginCall);
			} else {
				// Create new plugins property at the start
				config.properties.unshift(
					j.objectProperty(
						j.identifier("plugins"),
						j.arrayExpression([pluginCall])
					)
				);
			}

			// Remove poolOptions from test
			testObj.properties = testObj.properties.filter(
				(prop) => !isNamedProp(j, prop, "poolOptions")
			);
		});

	return root.toSource();
}

// Tell jscodeshift to use the TypeScript parser
export const parser = "ts";
