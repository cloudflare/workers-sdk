import assert from "node:assert";
import { existsSync } from "node:fs";
import path from "node:path";
import { brandColor } from "@cloudflare/cli/colors";
import { installPackages } from "@cloudflare/cli/packages";
import { transformFile } from "@cloudflare/codemod";
import * as recast from "recast";
import { Framework } from "./framework-class";
import { isPackageInstalled } from "./utils/packages";
import { installCloudflareVitePlugin } from "./utils/vite-plugin";
import type {
	ConfigurationOptions,
	ConfigurationResults,
} from "./framework-class";
import type { types } from "recast";

const b = recast.types.builders;
const t = recast.types.namedTypes;

export class Vike extends Framework {
	async configure({
		projectPath,
		dryRun,
		packageManager,
		isWorkspaceRoot,
	}: ConfigurationOptions): Promise<ConfigurationResults> {
		const vikeServerIsInstalled = isPackageInstalled(
			"vike-server",
			projectPath
		);
		if (vikeServerIsInstalled) {
			// Note: if vike-server is used we just error, this is the simplest solution, alternatively we could
			//       migrate the project as described in https://vike.dev/migration/vike-photon, but that is probably
			//       not currently worth the effort (but something we might consider if/when needed)
			throw new Error(
				'Aborting since the project is using the deprecated "vike-server" package, please remove the package from your project and try again.'
			);
		}

		if (!dryRun) {
			// note: the following installation steps follow the guide in: https://vike.dev/cloudflare#get-started

			await installPackages(
				packageManager.type,
				["vike-photon", "@photonjs/cloudflare"],
				{
					startText: "Installing vike-photon and @photonjs/cloudflare",
					doneText: `${brandColor(`installed`)} photon packages`,
					isWorkspaceRoot,
				}
			);

			await installCloudflareVitePlugin({
				packageManager: packageManager.type,
				isWorkspaceRoot,
				projectPath,
			});

			addVikePhotonToConfigFile(projectPath);
		}

		return {
			wranglerConfig: {
				main: "virtual:photon:cloudflare:server-entry",
			},
			packageJsonScriptsOverrides: {
				preview: "vike build && vike preview",
				deploy: "vike build && wrangler deploy",
			},
		};
	}
}

/**
 * Modifies a vike config file present at `pages/+config.(js|ts)` to import and use `vikePhoton`
 *
 * @param projectPath The project's path
 */
function addVikePhotonToConfigFile(projectPath: string) {
	const filePath = getConfigPath(projectPath);
	let programNode: types.namedTypes.Program | undefined;

	transformFile(filePath, {
		visitProgram(n) {
			programNode = n.node;
			addVikePhotonImportToConfigFile(n);
			return this.traverse(n);
		},
		visitExportDefaultDeclaration(n) {
			addVikePhotonToVikeConfigExportObject(n, programNode);
			return this.traverse(n);
		},
	});
}

/** Name of the vike config property that needs to include vikePhoton */
const vikeConfigExtendsPropName = "extends";

/**
 * Given a recast visitor node path for the vike config export declaration it adds vikePhoton to the config extends property
 *
 * @param n node path for the vike config file's default export
 */
function addVikePhotonToVikeConfigExportObject(
	n: Parameters<NonNullable<types.Visitor["visitExportDefaultDeclaration"]>>[0],
	programNode?: types.namedTypes.Program
) {
	const configObject = getVikeConfigObjectExpression(n, programNode);

	let configTargetProp = configObject.properties.find((prop) =>
		isExtendsProp(prop)
	);
	if (!configTargetProp) {
		configTargetProp = b.objectProperty(
			b.identifier(vikeConfigExtendsPropName),
			b.arrayExpression([])
		);
		configObject.properties.push(configTargetProp);
	}

	assert(configTargetProp && t.ArrayExpression.check(configTargetProp.value));

	// Determine the local import name for "vike-photon/config" (defaults to "vikePhoton").
	// This handles cases where the user already imported it under a different name.
	const vikePhotonLocalName =
		getVikePhotonImportLocalName(programNode) ?? "vikePhoton";

	// Only add vikePhoton if it's not already present
	if (
		!configTargetProp.value.elements.some(
			(el) => el?.type === "Identifier" && el.name === vikePhotonLocalName
		)
	) {
		configTargetProp.value.elements.push(b.identifier(vikePhotonLocalName));
	}
}

/**
 * Finds the local name used for the default import from "vike-photon/config".
 * e.g. `import vikePhoton from "vike-photon/config"` returns "vikePhoton",
 *      `import photon from "vike-photon/config"` returns "photon".
 */
function getVikePhotonImportLocalName(
	programNode?: types.namedTypes.Program
): string | undefined {
	if (!programNode) {
		return undefined;
	}
	for (const stmt of programNode.body) {
		if (
			t.ImportDeclaration.check(stmt) &&
			stmt.source.value === "vike-photon/config"
		) {
			const defaultSpec = stmt.specifiers?.find((s) =>
				t.ImportDefaultSpecifier.check(s)
			);
			if (defaultSpec && t.Identifier.check(defaultSpec.local)) {
				return defaultSpec.local.name;
			}
		}
	}
	return undefined;
}

/**
 * Given a recast visitor node path for the vike config export declaration it returns the object expression associated to it
 *
 * @param n node path for the vike config file's default export
 */
function getVikeConfigObjectExpression(
	n: Parameters<NonNullable<types.Visitor["visitExportDefaultDeclaration"]>>[0],
	programNode?: types.namedTypes.Program
): types.namedTypes.ObjectExpression {
	if (n.node.declaration.type === "ObjectExpression") {
		// The export is a simple object expression
		return n.node.declaration;
	}

	if (
		(n.node.declaration.type === "TSAsExpression" ||
			n.node.declaration.type === "TSSatisfiesExpression") &&
		n.node.declaration.expression.type === "ObjectExpression"
	) {
		// The export is an `as Config` or `satisfies Config` expression, so we go a level
		// deeper to get the object expression
		return n.node.declaration.expression;
	}

	if (n.node.declaration.type === "Identifier" && programNode) {
		// The export is a variable reference, e.g., `const config: Config = { ... }; export default config;`
		const objectExpression = resolveIdentifierToObjectExpression(
			n.node.declaration.name,
			programNode
		);
		if (objectExpression) {
			return objectExpression;
		}
	}

	throw new Error("Could not determine Vike default object export");
}

/**
 * Resolves a variable name to its ObjectExpression initializer by searching the program body.
 * Handles both plain object initializers and those wrapped in TSAsExpression/TSSatisfiesExpression.
 */
function resolveIdentifierToObjectExpression(
	varName: string,
	programNode: types.namedTypes.Program
): types.namedTypes.ObjectExpression | undefined {
	for (const stmt of programNode.body) {
		if (t.VariableDeclaration.check(stmt)) {
			for (const declarator of stmt.declarations) {
				if (
					t.VariableDeclarator.check(declarator) &&
					t.Identifier.check(declarator.id) &&
					declarator.id.name === varName &&
					declarator.init
				) {
					if (t.ObjectExpression.check(declarator.init)) {
						return declarator.init;
					}
					if (
						(t.TSAsExpression.check(declarator.init) ||
							t.TSSatisfiesExpression.check(declarator.init)) &&
						t.ObjectExpression.check(declarator.init.expression)
					) {
						return declarator.init.expression;
					}
				}
			}
		}
	}
	return undefined;
}

/**
 * Given a recast visitor node path for the vike config file it adds the following vikePhoton import to the file (if not already present):
 * ```
 * import vikePhoton from "vike-photon/config";
 * ```
 * @param n node path for the vike config file
 */
function addVikePhotonImportToConfigFile(
	n: Parameters<NonNullable<types.Visitor["visitProgram"]>>[0]
): void {
	const lastImportIndex = n.node.body.findLastIndex(
		(statement) => statement.type === "ImportDeclaration"
	);
	const lastImport = n.get("body", lastImportIndex);
	const importAst = b.importDeclaration(
		[b.importDefaultSpecifier(b.identifier("vikePhoton"))],
		b.stringLiteral("vike-photon/config")
	);

	// Only import if not already imported
	if (
		!n.node.body.some(
			(s) =>
				s.type === "ImportDeclaration" &&
				s.source.value === "vike-photon/config"
		)
	) {
		lastImport.insertAfter(importAst);
	}
}

function getConfigPath(projectPath: string): string {
	const filePathTS = path.join(projectPath, "pages", "+config.ts");
	const filePathJS = path.join(projectPath, "pages", "+config.js");

	let filePath: string;

	if (existsSync(filePathTS)) {
		filePath = filePathTS;
	} else if (existsSync(filePathJS)) {
		filePath = filePathJS;
	} else {
		throw new Error("Could not find config file to modify");
	}

	return filePath;
}

function isExtendsProp(
	prop: unknown
): prop is types.namedTypes.ObjectProperty | types.namedTypes.Property {
	return (
		(t.Property.check(prop) || t.ObjectProperty.check(prop)) &&
		t.Identifier.check(prop.key) &&
		prop.key.name === vikeConfigExtendsPropName
	);
}
