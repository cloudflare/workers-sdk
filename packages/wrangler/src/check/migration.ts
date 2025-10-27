import { createCommand, createNamespace } from "../core/create-command";
import { getMigrationsToUpload } from "../durable";
import { UserError } from "../errors";
import { isNonInteractiveOrCI } from "../is-interactive";
import { logger } from "../logger";
import { requireAuth } from "../user";
import { getScriptName } from "../utils/getScriptName";

export const checkNamespace = createNamespace({
	metadata: {
		description: "🔍 Check pending migrations for your Worker",
		owner: "Workers: Deploy and Config",
		status: "alpha",
		hidden: true,
	},
});

export const checkDOMigrationCommand = createCommand({
	args: {
		name: {
			describe: "Name of the Worker",
			type: "string",
			requiresArg: true,
		},
		json: {
			describe: "Return output as a clean JSON object",
			type: "boolean",
			default: false,
		},
	},
	behaviour: {
		printBanner: (args) => !args.json,
	},
	metadata: {
		description: "🔍 Check pending migrations for your Worker",
		owner: "Workers: Authoring and Testing",
		status: "alpha",
	},
	handler: async function doMigrationHandler(args, { config }) {
		const accountId = await requireAuth(config);
		const name = getScriptName(args, config);

		if (!name) {
			throw new UserError(
				'You need to provide a name of your worker. Either pass it as a cli arg with `--name <name>` or in your config file as `name = "<name>"`',
				{ telemetryMessage: true }
			);
		}

		const migrations = await getMigrationsToUpload(name, {
			accountId,
			config,
			// deprecated fields
			useServiceEnvironments: undefined,
			env: undefined,
			dispatchNamespace: undefined,
		});

		if (args.json || isNonInteractiveOrCI()) {
			logger.json(migrations?.steps ?? []);
			return;
		}

		if (!migrations || migrations.steps.length === 0) {
			logger.log("No DO migrations pending for this worker");
		} else {
			logger.table(
				migrations.steps.map((migration) => {
					const new_classes = migration.new_classes?.join("\n") ?? "";
					const new_sqlite_classes =
						migration.new_sqlite_classes?.join("\n") ?? "";
					const renamed_classes =
						migration.renamed_classes
							?.map((renamed_class) => {
								return `${renamed_class.from} to ${renamed_class.to}`;
							})
							.join("\n") ?? "";
					const deleted_classes = migration.deleted_classes?.join("\n") ?? "";

					return {
						"New Classes": new_classes,
						"New SQLite Classes": new_sqlite_classes,
						"Renamed Classes": renamed_classes,
						"Deleted Classes": deleted_classes,
					};
				})
			);
		}
	},
});
