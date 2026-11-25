import {
	mergeObjectProperties,
	parseTs,
} from "@cloudflare/shared-ast-primitives";
import * as recast from "recast";
import { AutoConfigFrameworkConfigurationError } from "./errors";
import { getStaticPropertyName } from "./frameworks/utils/vite-config";
import type { WorkerConfig } from "@cloudflare/config";
import type { types } from "recast";

const b = recast.types.builders;
const t = recast.types.namedTypes;

/**
 * Merges generated Worker configuration into an existing `cloudflare.config.ts`,
 * such as one written by `cf migrate`, keeping everything already in the file.
 *
 * Values set by the framework replace existing ones, merging objects and extending
 * arrays. Other values, such as the Worker name, are only added when missing.
 * Every Worker object returned by a `defineConfig()` function is updated.
 *
 * @param source The existing `cloudflare.config.ts` source
 * @param workerConfig The generated Worker configuration, including defaults
 * @param frameworkWorkerConfig The part of `workerConfig` set by the framework
 * @returns The updated source
 * @throws {AutoConfigFrameworkConfigurationError} If the Worker configuration is not an object literal in `defineConfig()`
 */
export function mergeCloudflareConfig(
	source: string,
	workerConfig: WorkerConfig,
	frameworkWorkerConfig: Partial<WorkerConfig>
): string {
	const ast = parseTs(source);
	const workerObjects = findWorkerObjects(ast);

	if (
		workerObjects.length === 0 ||
		!workerObjects.every((workerObject) => workerObject !== undefined)
	) {
		throw new AutoConfigFrameworkConfigurationError(
			`Cannot automatically update cloudflare.config.ts because its \`worker\` configuration is not an object literal. Add the following to it, then try again:\n${JSON.stringify(frameworkWorkerConfig, null, 2)}`,
			{ telemetryMessage: "autoconfig cloudflare config merge unsupported" }
		);
	}

	for (const workerObject of workerObjects) {
		for (const [key, value] of Object.entries(workerConfig)) {
			if (value === undefined) {
				continue;
			}
			const property = b.objectProperty(
				getPropertyKey(key),
				toExpression(value)
			);
			if (Object.hasOwn(frameworkWorkerConfig, key)) {
				mergeObjectProperties(workerObject, [property]);
			} else if (
				!workerObject.properties.some(
					(existing) => getStaticPropertyName(existing) === key
				)
			) {
				workerObject.properties.push(property);
			}
		}
	}

	return recast.print(ast).code;
}

/**
 * Reads the Worker entrypoint from a `cloudflare.config.ts` without running it.
 *
 * @param source The `cloudflare.config.ts` source
 * @returns The entrypoint, if the file sets it as a string literal
 */
export function readWorkerEntrypoint(source: string): string | undefined {
	for (const workerObject of findWorkerObjects(parseTs(source))) {
		const entrypoint = workerObject?.properties.findLast(
			(property) => getStaticPropertyName(property) === "entrypoint"
		);
		if (
			t.ObjectProperty.check(entrypoint) &&
			t.StringLiteral.check(entrypoint.value)
		) {
			return entrypoint.value.value;
		}
	}
	return undefined;
}

/**
 * Finds the Worker objects of the config that `cloudflare.config.ts` exports, directly or through `defineConfig()`.
 *
 * @param ast The parsed `cloudflare.config.ts`
 * @returns One entry per config object, `undefined` where its `worker` is not an object literal
 */
function findWorkerObjects(
	ast: ReturnType<typeof parseTs>
): (types.namedTypes.ObjectExpression | undefined)[] {
	let declaration = ast.program.body.find((statement) =>
		t.ExportDefaultDeclaration.check(statement)
	)?.declaration;
	// `export default { ... } satisfies CloudflareConfig`, as autoconfig writes it
	while (
		t.TSSatisfiesExpression.check(declaration) ||
		t.TSAsExpression.check(declaration)
	) {
		declaration = declaration.expression;
	}
	if (t.ObjectExpression.check(declaration)) {
		return [getWorkerObject(declaration)];
	}
	return t.CallExpression.check(declaration) &&
		t.Identifier.check(declaration.callee) &&
		declaration.callee.name === "defineConfig"
		? getConfigObjects(declaration.arguments[0]).map(getWorkerObject)
		: [];
}

/**
 * Finds the config objects passed to or returned by `defineConfig()`, without
 * descending into nested functions.
 */
function getConfigObjects(
	node: types.ASTNode | undefined
): types.namedTypes.ObjectExpression[] {
	if (t.ObjectExpression.check(node)) {
		return [node];
	}
	if (
		!t.ArrowFunctionExpression.check(node) &&
		!t.FunctionExpression.check(node)
	) {
		return [];
	}
	if (t.ObjectExpression.check(node.body)) {
		return [node.body];
	}

	const configObjects: types.namedTypes.ObjectExpression[] = [];
	recast.visit(node.body, {
		visitFunction() {
			return false;
		},
		visitReturnStatement(path) {
			if (t.ObjectExpression.check(path.node.argument)) {
				configObjects.push(path.node.argument);
			}
			return false;
		},
	});
	return configObjects;
}

function getWorkerObject(
	configObject: types.namedTypes.ObjectExpression
): types.namedTypes.ObjectExpression | undefined {
	const index = configObject.properties.findLastIndex(
		(property) => getStaticPropertyName(property) === "worker"
	);
	const workerProperty = configObject.properties[index];
	return t.ObjectProperty.check(workerProperty) &&
		t.ObjectExpression.check(workerProperty.value) &&
		// A later spread or computed key could replace `worker`, so the literal may not be the Worker that's used
		!configObject.properties
			.slice(index + 1)
			.some((property) => getStaticPropertyName(property) === undefined)
		? workerProperty.value
		: undefined;
}

function getPropertyKey(
	key: string
): types.namedTypes.Identifier | types.namedTypes.StringLiteral {
	return /^[A-Za-z_$][\w$]*$/.test(key)
		? b.identifier(key)
		: b.stringLiteral(key);
}

/** Converts a JSON-compatible configuration value into an expression. */
function toExpression(
	value: unknown
):
	| types.namedTypes.ArrayExpression
	| types.namedTypes.ObjectExpression
	| types.namedTypes.StringLiteral
	| types.namedTypes.NumericLiteral
	| types.namedTypes.BooleanLiteral
	| types.namedTypes.NullLiteral {
	if (Array.isArray(value)) {
		return b.arrayExpression(value.map(toExpression));
	}
	if (typeof value === "object" && value !== null) {
		return b.objectExpression(
			Object.entries(value)
				.filter(([, entry]) => entry !== undefined)
				.map(([key, entry]) =>
					b.objectProperty(getPropertyKey(key), toExpression(entry))
				)
		);
	}
	if (typeof value === "string") {
		return b.stringLiteral(value);
	}
	if (typeof value === "number") {
		return b.numericLiteral(value);
	}
	if (typeof value === "boolean") {
		return b.booleanLiteral(value);
	}
	return b.nullLiteral();
}
