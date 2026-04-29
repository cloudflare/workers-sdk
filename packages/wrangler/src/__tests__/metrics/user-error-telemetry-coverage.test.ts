import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import ts from "typescript";
import { describe, it } from "vitest";
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
		process.stderr.write(
			`${report}\n\nWarning: telemetryMessage coverage is below 100%.\n`
		);
		return;
	}

	process.stdout.write(`${report}\n`);
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

function hasTelemetryMessage(errorSource: ErrorSource): boolean {
	const telemetryArgIndex = getTelemetryArgIndex(errorSource.name);

	if (telemetryArgIndex !== undefined) {
		return hasTelemetryMessageProperty(errorSource.args[telemetryArgIndex]);
	}

	return errorSource.args.some(hasTelemetryMessageProperty);
}

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

function hasTelemetryMessageProperty(arg: ts.Expression | undefined): boolean {
	return (
		arg !== undefined &&
		ts.isObjectLiteralExpression(arg) &&
		arg.properties.some(isTelemetryMessageProperty)
	);
}

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

function getPropertyName(propertyName: ts.PropertyName): string | undefined {
	if (ts.isIdentifier(propertyName) || ts.isStringLiteral(propertyName)) {
		return propertyName.text;
	}
}

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
