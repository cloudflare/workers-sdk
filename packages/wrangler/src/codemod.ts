import assert from "node:assert";
import { existsSync } from "node:fs";
import path from "node:path";
import { UserError } from "@cloudflare/workers-utils";
import * as recast from "recast";
import { transformFile } from "./autoconfig/c3-vendor/codemod";
import { createCommand } from "./core/create-command";
import { logger } from "./logger";

const b = recast.types.builders;
const t = recast.types.namedTypes;

function isNamedProp(
	prop: unknown,
	name: string
): prop is
	| recast.types.namedTypes.ObjectProperty
	| recast.types.namedTypes.Property {
	return (
		(t.Property.check(prop) || t.ObjectProperty.check(prop)) &&
		t.Identifier.check(prop.key) &&
		prop.key.name === name
	);
}

function vitestPoolV3ToV4(args: string | undefined) {
	const filePathTS = path.join(process.cwd(), `vitest.config.ts`);
	const filePathJS = path.join(process.cwd(), `vitest.config.js`);

	let filePath: string;

	if (args) {
		if (!existsSync(args)) {
			throw new UserError(
				`Selected Vitest config file does not exist: '${args}'`
			);
		}
		filePath = path.resolve(process.cwd(), args);
	} else if (existsSync(filePathTS)) {
		filePath = filePathTS;
	} else if (existsSync(filePathJS)) {
		filePath = filePathJS;
	} else {
		throw new UserError("Could not find Vitest config file to modify");
	}

	transformFile(filePath, {
		visitProgram(n) {
			// Find the existing import of @cloudflare/vitest-pool-workers/config
			// ```
			// import { defineWorkersProject } from "@cloudflare/vitest-pool-workers/config";
			// ```
			const importAst = n.node.body.find(
				(s) =>
					s.type === "ImportDeclaration" &&
					s.source.value === "@cloudflare/vitest-pool-workers/config" &&
					s.specifiers?.some(
						(specifier) =>
							specifier.type === "ImportSpecifier" &&
							specifier.imported?.name === "defineWorkersProject"
					)
			);
			if (!importAst) {
				throw new UserError(
					"Could not find import of `@cloudflare/vitest-pool-workers/config`"
				);
			}

			const lastImportIndex = n.node.body.findLastIndex(
				(statement) => statement.type === "ImportDeclaration"
			);
			const lastImport = n.get("body", lastImportIndex);
			const vitestConfigAst = b.importDeclaration(
				[b.importSpecifier(b.identifier("defineConfig"))],
				b.stringLiteral("vitest/config")
			);

			lastImport.insertAfter(vitestConfigAst);

			assert(importAst.type === "ImportDeclaration");

			importAst.source.value = "@cloudflare/vitest-pool-workers";
			importAst.specifiers = [
				b.importSpecifier(b.identifier("cloudflareTest")),
				...(importAst.specifiers?.filter(
					(specifier) =>
						!(
							specifier.type === "ImportSpecifier" &&
							specifier.imported?.name === "defineWorkersProject"
						)
				) ?? []),
			];

			return this.traverse(n);
		},
		visitCallExpression: function (n) {
			// Add the imported plugin to the config
			// ```
			// defineConfig({
			//   plugins: [cloudflare({ viteEnvironment: { name: 'ssr' } })],
			// });
			const callee = n.node.callee as recast.types.namedTypes.Identifier;
			if (callee.name !== "defineWorkersProject") {
				return this.traverse(n);
			}
			callee.name = "defineConfig";

			const config = n.node.arguments[0];
			assert(
				t.ObjectExpression.check(config),
				"defineWorkersProject() is called with a function and not an object, and so is too complex to apply a codemod to. Please refer to the migration docs to perform the migration manually."
			);

			const testProp = config.properties.find((prop) =>
				isNamedProp(prop, "test")
			);

			assert(
				testProp && t.ObjectExpression.check(testProp.value),
				"Could not find `test` property in config"
			);

			const poolOptionsProp = testProp.value.properties.find((prop) =>
				isNamedProp(prop, "poolOptions")
			);

			assert(
				poolOptionsProp && t.ObjectExpression.check(poolOptionsProp.value),
				"Could not find `test.poolOptions` property in config"
			);

			const poolOptionsWorkersProp = poolOptionsProp.value.properties.find(
				(prop) => isNamedProp(prop, "workers")
			);

			assert(
				poolOptionsWorkersProp &&
					(t.ObjectExpression.check(poolOptionsWorkersProp.value) ||
						t.FunctionExpression.check(poolOptionsWorkersProp.value) ||
						t.ArrowFunctionExpression.check(poolOptionsWorkersProp.value)),
				"Could not find `test.poolOptions.workers` property in config"
			);

			const pluginsProp = config.properties.find((prop) =>
				isNamedProp(prop, "plugins")
			);

			if (pluginsProp) {
				assert(t.ArrayExpression.check(pluginsProp.value));
				pluginsProp.value.elements.unshift(
					b.callExpression(b.identifier("cloudflareTest"), [
						poolOptionsWorkersProp.value,
					])
				);
			} else {
				config.properties.unshift(
					b.objectProperty(
						b.identifier("plugins"),
						b.arrayExpression([
							b.callExpression(b.identifier("cloudflareTest"), [
								poolOptionsWorkersProp.value,
							]),
						])
					)
				);
			}
			testProp.value.properties = testProp.value.properties.filter(
				(prop) => !isNamedProp(prop, "poolOptions")
			);
			return false;
		},
	});
}

const validCodemods = new Map<string, (args: string | undefined) => void>([
	["vitest-pool-v3-to-v4", vitestPoolV3ToV4],
]);

export const codemodCommand = createCommand({
	behaviour: {
		provideConfig: false,
		overrideExperimentalFlags: (args) => ({
			MULTIWORKER: Array.isArray(args.config),
			RESOURCES_PROVISION: args.experimentalProvision ?? false,
			AUTOCREATE_RESOURCES: args.experimentalAutoCreate,
		}),
	},
	metadata: {
		description: "🔨 Apply a code modification to your project",
		owner: "Workers: Authoring and Testing",
		status: "experimental",
	},
	positionalArgs: ["name"],
	args: {
		name: {
			describe: "The name of the codemod you want to apply",
			type: "string",
		},
		args: {
			describe: "Extra arguments to pass to the selected codemod",
			type: "string",
		},
	},
	async validateArgs(args) {
		if (args.name !== undefined && !validCodemods.has(args.name)) {
			throw new UserError(
				`${args.name} is not a valid codemod name. Valid names are ${[...validCodemods.keys()].join(", ")}`
			);
		}
	},
	async handler(args) {
		if (args.name === undefined || args.name === "") {
			logger.log("Apply one of the following codemods:");
			for (const name of validCodemods.keys()) {
				logger.log(`- ${name}`);
			}
		} else {
			const codemod = validCodemods.get(args.name);
			assert(codemod);
			await codemod(args.args);
		}
	},
});
