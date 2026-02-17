import assert from "node:assert";
import { existsSync } from "node:fs";
import path from "node:path";
import { brandColor } from "@cloudflare/cli/colors";
import * as recast from "recast";
import { transformFile } from "../c3-vendor/codemod";
import { installPackages } from "../c3-vendor/packages";
import { isPackageInstalled } from "./utils/packages";
import { Framework } from ".";
import type { ConfigurationOptions, ConfigurationResults } from ".";
import type { types } from "recast";

const b = recast.types.builders;
const t = recast.types.namedTypes;

export class Vike extends Framework {
	async configure({
		projectPath,
		dryRun,
		packageManager,
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
				packageManager,
				["vike-photon", "@photonjs/cloudflare"],
				{
					startText: "Installing vike-photon and @photonjs/cloudflare",
					doneText: `${brandColor(`installed`)} photon packages`,
				}
			);
			await installPackages(packageManager, ["@cloudflare/vite-plugin"], {
				dev: true,
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

	transformFile(filePath, {
		visitProgram(n) {
			addVikePhotonImportToConfigFile(n);
			return this.traverse(n);
		},
		visitExportDefaultDeclaration(n) {
			addVikePhotonToVikeConfigExportObject(n);
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
	n: Parameters<NonNullable<types.Visitor["visitExportDefaultDeclaration"]>>[0]
) {
	const configObject = getVikeConfigObjectExpression(n);

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

	// Only add vikePhoton if it's not already present
	if (
		!configTargetProp.value.elements.some(
			(el) =>
				el?.type === "CallExpression" &&
				el.callee.type === "Identifier" &&
				el.callee.name === vikeConfigExtendsPropName
		)
	) {
		configTargetProp.value.elements.push(b.identifier("vikePhoton"));
	}
}

/**
 * Given a recast visitor node path for the vike config export declaration it returns the object expression associated to it
 *
 * @param n node path for the vike config file's default export
 */
function getVikeConfigObjectExpression(
	n: Parameters<NonNullable<types.Visitor["visitExportDefaultDeclaration"]>>[0]
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
		// The export is an `as Config` or `satisfied Config` expression, so we go a level
		// deeper to get the object expression
		return n.node.declaration.expression;
	}

	throw new Error("Could not determine Vike default object export");
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
