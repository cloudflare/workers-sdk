/**
 * Migrates @cloudflare/vitest-pool-workers configuration from Vitest v3 to v4.
 */

// Minimal jscodeshift types avoid exposing jscodeshift as a runtime dependency.
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
	imported?: IdentifierNode;
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
	// eslint-disable-next-line @typescript-eslint/no-explicit-any -- jscodeshift narrows NodePath callback types dynamically
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
		prop.key.name === name
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
	const configImports = root.find(j.ImportDeclaration, {
		source: { value: "@cloudflare/vitest-pool-workers/config" },
	});

	const matchingImports = configImports.paths().flatMap((path) => {
		const importPath = path as NodePath<ImportDeclarationNode>;
		const specifier = importPath.node.specifiers.find(
			(candidate) =>
				candidate.type === "ImportSpecifier" &&
				candidate.imported?.name === "defineWorkersProject"
		);
		if (!specifier) {
			return [];
		}

		const localName = specifier.local?.name ?? "defineWorkersProject";
		const calls = root.find(j.CallExpression, {
			callee: { name: localName },
		});
		return calls.length === 0 ? [] : [{ importPath, localName, calls }];
	});

	if (matchingImports.length === 0) {
		return fileInfo.source;
	}
	if (matchingImports.length > 1) {
		throw new Error("Multiple defineWorkersProject imports are not supported");
	}

	const [{ importPath, localName, calls }] = matchingImports;
	const rootPackageImports = root.find(j.ImportDeclaration, {
		source: { value: "@cloudflare/vitest-pool-workers" },
	});
	let cloudflareTestName: string | undefined;
	for (const path of rootPackageImports.paths()) {
		const rootImport = path as NodePath<ImportDeclarationNode>;
		const specifier = rootImport.node.specifiers.find(
			(candidate) =>
				candidate.type === "ImportSpecifier" &&
				candidate.imported?.name === "cloudflareTest"
		);
		if (specifier) {
			cloudflareTestName = specifier.local?.name ?? "cloudflareTest";
			break;
		}
	}

	if (!cloudflareTestName) {
		cloudflareTestName = "cloudflareTest";
		importPath.node.specifiers.unshift(
			j.importSpecifier(j.identifier(cloudflareTestName))
		);
	}
	importPath.node.source.value = "@cloudflare/vitest-pool-workers";
	importPath.node.specifiers = importPath.node.specifiers.filter(
		(specifier) =>
			!(
				specifier.type === "ImportSpecifier" &&
				specifier.imported?.name === "defineWorkersProject"
			)
	);

	const vitestConfigImports = root.find(j.ImportDeclaration, {
		source: { value: "vitest/config" },
	});
	let defineConfigName = "defineConfig";
	let hasDefineConfigImport = false;
	for (const path of vitestConfigImports.paths()) {
		const vitestImport = path as NodePath<ImportDeclarationNode>;
		const specifier = vitestImport.node.specifiers.find(
			(candidate) =>
				candidate.type === "ImportSpecifier" &&
				candidate.imported?.name === "defineConfig"
		);
		if (specifier) {
			defineConfigName = specifier.local?.name ?? "defineConfig";
			hasDefineConfigImport = true;
			break;
		}
	}

	if (!hasDefineConfigImport) {
		const vitestImportPath = vitestConfigImports.paths()[0] as
			| NodePath<ImportDeclarationNode>
			| undefined;
		if (vitestImportPath) {
			vitestImportPath.node.specifiers.push(
				j.importSpecifier(j.identifier(defineConfigName))
			);
		} else {
			root
				.find(j.ImportDeclaration)
				.at(-1)
				.forEach((path: NodePath) => {
					path.insertAfter(
						j.importDeclaration(
							[j.importSpecifier(j.identifier(defineConfigName))],
							j.stringLiteral("vitest/config")
						)
					);
				});
		}
	}

	calls.forEach((path: NodePath<CallExpressionNode>) => {
		if (
			!j.Identifier.check(path.node.callee) ||
			path.node.callee.name !== localName
		) {
			return;
		}
		path.node.callee.name = defineConfigName;

		const config = path.node.arguments[0];
		if (!j.ObjectExpression.check(config)) {
			throw new Error(
				"defineWorkersProject() is called with a function and not an object, " +
					"and so is too complex to apply a codemod to. " +
					"Please refer to the migration docs to perform the migration manually."
			);
		}

		const testProp = findNamedProp(j, config.properties, "test");
		if (!testProp || !j.ObjectExpression.check(testProp.value)) {
			throw new Error("Could not find `test` property in config");
		}
		const testObj = testProp.value;

		const poolOptionsProp = findNamedProp(j, testObj.properties, "poolOptions");
		if (!poolOptionsProp || !j.ObjectExpression.check(poolOptionsProp.value)) {
			throw new Error("Could not find `test.poolOptions` property in config");
		}
		const poolOptionsObj = poolOptionsProp.value;

		const workersProp = findNamedProp(j, poolOptionsObj.properties, "workers");
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

		const pluginCall = j.callExpression(j.identifier(cloudflareTestName), [
			workersProp.value,
		]);
		const pluginsProp = findNamedProp(j, config.properties, "plugins");
		if (pluginsProp && j.ArrayExpression.check(pluginsProp.value)) {
			pluginsProp.value.elements.unshift(pluginCall);
		} else {
			config.properties.unshift(
				j.objectProperty(
					j.identifier("plugins"),
					j.arrayExpression([pluginCall])
				)
			);
		}

		testObj.properties = testObj.properties.filter(
			(prop) => !isNamedProp(j, prop, "poolOptions")
		);
	});

	return root.toSource();
}
