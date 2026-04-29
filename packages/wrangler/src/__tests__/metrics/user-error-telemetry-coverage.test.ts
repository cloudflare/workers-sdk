import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import ts from "typescript";
import { describe, it } from "vitest";
import { logger } from "../../logger";
import { getBasePath } from "../../paths";

const USER_ERROR_CONSTRUCTORS = [
	"CommandLineArgsError",
	"DeprecationError",
	"FatalError",
	"JsonFriendlyFatalError",
	"UserError",
] as const;

const USER_ERROR_CONSTRUCTOR_NAMES = new Set<string>(USER_ERROR_CONSTRUCTORS);
const USER_ERROR_FACTORIES = ["createFatalError"] as const;
const USER_ERROR_FACTORY_NAMES = new Set<string>(USER_ERROR_FACTORIES);
const MAX_MISSING_LOCATION_EXAMPLES = 200;

type ConstructorStats = {
	total: number;
	withTelemetryMessage: number;
	withoutTelemetryMessage: number;
};

type CoverageSummary = {
	total: number;
	withTelemetryMessage: number;
	withoutTelemetryMessage: number;
	byConstructor: Record<string, ConstructorStats>;
	missingLocationExamples: string[];
};

type ErrorSource = {
	name: string;
	args: ts.NodeArray<ts.Expression>;
};

describe("UserError telemetry coverage", () => {
	it("reports telemetryMessage coverage for UserError-compatible errors", ({
		expect,
	}) => {
		const summary = getUserErrorTelemetryCoverage();

		printCoverageReport(summary);

		expect(summary.total).toBeGreaterThan(0);
	});
});

function printCoverageReport(summary: CoverageSummary): void {
	const coveragePercent = getCoveragePercent(summary);
	const report = [
		"UserError telemetryMessage coverage",
		`  Coverage: ${formatPercent(coveragePercent)}`,
		`  Covered:  ${summary.withTelemetryMessage}/${summary.total}`,
		`  Missing:  ${summary.withoutTelemetryMessage}`,
		"  Missing examples:",
		...summary.missingLocationExamples.map((location) => `    ${location}`),
	].join("\n");

	if (coveragePercent < 100) {
		logger.warn(`${report}\n\nWarning: telemetryMessage coverage is below 100%.`);
		return;
	}

	logger.log(report);
}

function getCoveragePercent(summary: CoverageSummary): number {
	if (summary.total === 0) {
		return 100;
	}

	return (summary.withTelemetryMessage / summary.total) * 100;
}

function formatPercent(value: number): string {
	return `${value.toFixed(2)}%`;
}

/**
 * Scans Wrangler source files for user-facing error constructors and counts
 * whether each site passes a safe telemetry label in the expected argument.
 */
function getUserErrorTelemetryCoverage(): CoverageSummary {
	const basePath = getBasePath();
	const srcPath = path.join(basePath, "src");
	const sourceFiles = getSourceFiles(srcPath);
	const userErrorConstructorNames = getUserErrorConstructorNames(sourceFiles);
	const summary: CoverageSummary = {
		total: 0,
		withTelemetryMessage: 0,
		withoutTelemetryMessage: 0,
		byConstructor: {},
		missingLocationExamples: [],
	};

	for (const filePath of sourceFiles) {
		const contents = readFileSync(filePath, "utf8");
		const sourceFile = ts.createSourceFile(
			filePath,
			contents,
			ts.ScriptTarget.Latest,
			true
		);

		visitSourceFile(sourceFile, (node) => {
			const errorSource = getErrorSource(node, userErrorConstructorNames);
			if (errorSource === undefined) {
				return;
			}

			const constructorStats = getConstructorStats(summary, errorSource.name);
			const hasTelemetry = hasTelemetryMessage(errorSource);
			summary.total++;
			constructorStats.total++;

			if (hasTelemetry) {
				summary.withTelemetryMessage++;
				constructorStats.withTelemetryMessage++;
			} else {
				summary.withoutTelemetryMessage++;
				constructorStats.withoutTelemetryMessage++;

				if (
					summary.missingLocationExamples.length <
					MAX_MISSING_LOCATION_EXAMPLES
				) {
					summary.missingLocationExamples.push(
						formatLocation(basePath, filePath, sourceFile, node)
					);
				}
			}
		});
	}

	return summary;
}

/**
 * Builds the set of constructors that behave like `UserError`, including local
 * subclasses such as Pages or auth-specific errors. This is intentionally based
 * on inheritance in source rather than a hand-maintained list, so the coverage
 * report catches new local subclasses automatically.
 */
function getUserErrorConstructorNames(sourceFiles: string[]): Set<string> {
	const constructorNames = new Set<string>(USER_ERROR_CONSTRUCTOR_NAMES);
	let addedConstructor = true;

	while (addedConstructor) {
		addedConstructor = false;

		for (const filePath of sourceFiles) {
			const sourceFile = ts.createSourceFile(
				filePath,
				readFileSync(filePath, "utf8"),
				ts.ScriptTarget.Latest,
				true
			);

			visitSourceFile(sourceFile, (node) => {
				if (!ts.isClassDeclaration(node) || node.name === undefined) {
					return;
				}

				const baseClassName = getBaseClassName(node);
				if (
					baseClassName !== undefined &&
					constructorNames.has(baseClassName) &&
					!constructorNames.has(node.name.text)
				) {
					constructorNames.add(node.name.text);
					addedConstructor = true;
				}
			});
		}
	}

	return constructorNames;
}

/**
 * Recursively enumerates Wrangler source files while excluding tests, so the
 * coverage number reflects production error sites rather than test fixtures.
 */
function getSourceFiles(directoryPath: string): string[] {
	const entries = readdirSync(directoryPath).sort();
	const files: string[] = [];

	for (const entry of entries) {
		const entryPath = path.join(directoryPath, entry);
		const stat = statSync(entryPath);

		if (stat.isDirectory()) {
			if (entry === "__tests__") {
				continue;
			}
			files.push(...getSourceFiles(entryPath));
		} else if (entry.endsWith(".ts") && !entry.endsWith(".d.ts")) {
			files.push(entryPath);
		}
	}

	return files;
}

/** Traverses every AST node in a parsed TypeScript source file. */
function visitSourceFile(
	sourceFile: ts.SourceFile,
	visit: (node: ts.Node) => void
): void {
	function visitNode(node: ts.Node): void {
		visit(node);
		ts.forEachChild(node, visitNode);
	}

	visitNode(sourceFile);
}

/** Returns the final identifier for constructor-like expressions. */
function getConstructorName(
	expression: ts.NewExpression["expression"]
): string | undefined {
	if (ts.isIdentifier(expression)) {
		return expression.text;
	}

	if (ts.isPropertyAccessExpression(expression)) {
		return expression.name.text;
	}
}

/** Returns the direct superclass name for a class declaration, if present. */
function getBaseClassName(node: ts.ClassDeclaration): string | undefined {
	const extendsClause = node.heritageClauses?.find(
		(clause) => clause.token === ts.SyntaxKind.ExtendsKeyword
	);
	const [baseClass] = extendsClause?.types ?? [];

	if (baseClass === undefined) {
		return;
	}

	return getConstructorName(baseClass.expression);
}

/**
 * Identifies constructor/factory calls that create user-facing errors tracked by
 * this coverage report.
 */
function getErrorSource(
	node: ts.Node,
	constructorNames: Set<string>
): ErrorSource | undefined {
	if (ts.isNewExpression(node)) {
		const constructorName = getConstructorName(node.expression);
		if (constructorName !== undefined && constructorNames.has(constructorName)) {
			return {
				name: constructorName,
				args: node.arguments ?? ts.factory.createNodeArray(),
			};
		}
	}

	if (ts.isCallExpression(node)) {
		const functionName = getConstructorName(node.expression);
		if (
			functionName !== undefined &&
			USER_ERROR_FACTORY_NAMES.has(functionName)
		) {
			return { name: functionName, args: node.arguments };
		}
	}
}

/** Lazily creates per-constructor counters in the aggregate coverage summary. */
function getConstructorStats(
	summary: CoverageSummary,
	constructorName: string
): ConstructorStats {
	const existingStats = summary.byConstructor[constructorName];
	if (existingStats !== undefined) {
		return existingStats;
	}

	const stats: ConstructorStats = {
		total: 0,
		withTelemetryMessage: 0,
		withoutTelemetryMessage: 0,
	};
	summary.byConstructor[constructorName] = stats;
	return stats;
}

/**
 * Checks for `telemetryMessage` in the argument position actually consumed by
 * each known constructor. For local subclasses with unknown signatures, fall
 * back to accepting any object-literal argument that includes the property.
 */
function hasTelemetryMessage(errorSource: ErrorSource): boolean {
	const telemetryArgIndex = getTelemetryArgIndex(errorSource.name);

	if (telemetryArgIndex !== undefined) {
		return hasTelemetryMessageProperty(errorSource.args[telemetryArgIndex]);
	}

	return errorSource.args.some(hasTelemetryMessageProperty);
}

/** Returns the expected telemetry options argument index for known signatures. */
function getTelemetryArgIndex(errorSourceName: string): number | undefined {
	if (
		errorSourceName === "UserError" ||
		errorSourceName === "CommandLineArgsError" ||
		errorSourceName === "DeprecationError"
	) {
		return 1;
	}

	if (
		errorSourceName === "FatalError" ||
		errorSourceName === "JsonFriendlyFatalError"
	) {
		return 2;
	}

	if (errorSourceName === "createFatalError") {
		return 3;
	}
}

/** Returns whether an expression is an object literal with `telemetryMessage`. */
function hasTelemetryMessageProperty(arg: ts.Expression | undefined): boolean {
	return (
		arg !== undefined &&
		ts.isObjectLiteralExpression(arg) &&
		arg.properties.some(isTelemetryMessageProperty)
	);
}

/** Checks whether an object-literal member is named `telemetryMessage`. */
function isTelemetryMessageProperty(
	property: ts.ObjectLiteralElementLike
): boolean {
	if (
		ts.isPropertyAssignment(property) ||
		ts.isShorthandPropertyAssignment(property) ||
		ts.isMethodDeclaration(property)
	) {
		return getPropertyName(property.name) === "telemetryMessage";
	}

	return false;
}

/** Extracts a plain string name from supported object-literal property names. */
function getPropertyName(propertyName: ts.PropertyName): string | undefined {
	if (ts.isIdentifier(propertyName) || ts.isStringLiteral(propertyName)) {
		return propertyName.text;
	}
}

/** Formats a source location relative to the Wrangler package root. */
function formatLocation(
	basePath: string,
	filePath: string,
	sourceFile: ts.SourceFile,
	node: ts.Node
): string {
	const { line, character } = sourceFile.getLineAndCharacterOfPosition(
		node.getStart(sourceFile)
	);
	const relativePath = path
		.relative(basePath, filePath)
		.replaceAll(path.sep, "/");
	return `${relativePath}:${line + 1}:${character + 1}`;
}
