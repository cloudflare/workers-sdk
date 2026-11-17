import { parseTs } from "@cloudflare/shared-ast-primitives";
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
 * The framework's entrypoint replaces an existing one, since the framework cannot
 * run without it. Its other values are only added where missing, including inside
 * existing objects. A config without a `worker` gets the whole generated Worker
 * configuration. Every config returned by a `defineConfig()` function is updated.
 *
 * @param source The existing `cloudflare.config.ts` source
 * @param workerConfig The generated Worker configuration, including defaults
 * @param frameworkWorkerConfig The part of `workerConfig` set by the framework
 * @returns The updated source
 * @throws {AutoConfigFrameworkConfigurationError} If the configuration to update is not written as object literals in `defineConfig()`
 */
export function mergeCloudflareConfig(
	source: string,
	workerConfig: WorkerConfig,
	frameworkWorkerConfig: Partial<WorkerConfig>
): string {
	const ast = parseTs(source);
	const declaration = ast.program.body.find((statement) =>
		t.ExportDefaultDeclaration.check(statement)
	)?.declaration;
	const configObjects =
		t.CallExpression.check(declaration) &&
		t.Identifier.check(declaration.callee) &&
		declaration.callee.name === "defineConfig"
			? getConfigObjects(declaration.arguments[0])
			: [];
	const cannotMergeError = new AutoConfigFrameworkConfigurationError(
		`Cannot automatically update cloudflare.config.ts because its Worker configuration is not written as object literals in \`defineConfig()\`. Add the following to its \`worker\` configuration, then try again:\n${JSON.stringify(frameworkWorkerConfig, null, 2)}`,
		{ telemetryMessage: "autoconfig cloudflare config merge unsupported" }
	);
	if (configObjects.length === 0) {
		throw cannotMergeError;
	}

	const { entrypoint, ...otherValues } = frameworkWorkerConfig;
	for (const configObject of configObjects) {
		const workerProperty = findProperty(configObject, "worker");
		if (workerProperty === undefined) {
			configObject.properties.push(
				b.objectProperty(b.identifier("worker"), toExpression(workerConfig))
			);
			continue;
		}
		if (
			!t.ObjectProperty.check(workerProperty) ||
			!t.ObjectExpression.check(workerProperty.value)
		) {
			throw cannotMergeError;
		}

		const workerObject = workerProperty.value;
		if (entrypoint !== undefined) {
			const property = b.objectProperty(
				b.identifier("entrypoint"),
				toExpression(entrypoint)
			);
			const existing = findProperty(workerObject, "entrypoint");
			if (existing === undefined) {
				workerObject.properties.push(property);
			} else {
				workerObject.properties[workerObject.properties.indexOf(existing)] =
					property;
			}
		}
		addMissingProperties(workerObject, otherValues, cannotMergeError);
	}

	return recast.print(ast).code;
}

/**
 * Adds the values an object literal is missing, descending into nested object
 * literals without changing any existing value.
 */
function addMissingProperties(
	object: types.namedTypes.ObjectExpression,
	values: Record<string, unknown>,
	cannotMergeError: Error
): void {
	for (const [key, value] of Object.entries(values)) {
		if (value === undefined) {
			continue;
		}
		const existing = findProperty(object, key);
		if (existing === undefined) {
			object.properties.push(
				b.objectProperty(getPropertyKey(key), toExpression(value))
			);
		} else if (isRecord(value)) {
			if (
				!t.ObjectProperty.check(existing) ||
				!t.ObjectExpression.check(existing.value)
			) {
				throw cannotMergeError;
			}
			addMissingProperties(existing.value, value, cannotMergeError);
		}
	}
}

function findProperty(
	object: types.namedTypes.ObjectExpression,
	key: string
): types.namedTypes.ObjectExpression["properties"][number] | undefined {
	return object.properties.findLast(
		(property) => getStaticPropertyName(property) === key
	);
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null && !Array.isArray(value);
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
	if (isRecord(value)) {
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
