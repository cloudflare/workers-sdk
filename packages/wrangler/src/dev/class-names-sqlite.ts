import { UserError, getDurableObjectExports } from "@cloudflare/workers-utils";
import type { Config } from "@cloudflare/workers-utils";

/**
 * Infer Durable Object class names and storage backends from migrations and
 * live declarative `exports` entries.
 *
 * In practice only one of `migrations` or `exports` will have the Durable Object configuration.
 */
export function getDurableObjectClassNameToUseSQLiteMap(
	migrations: Config["migrations"] | undefined,
	exports?: Config["exports"] | undefined
) {
	const durableObjectClassNameToUseSQLiteMap = new Map<string, boolean>();

	(migrations ?? []).forEach((migration) => {
		migration.deleted_classes?.forEach((deleted_class) => {
			if (!durableObjectClassNameToUseSQLiteMap.delete(deleted_class)) {
				throw new UserError(
					`Cannot apply deleted_classes migration to non-existent class ${deleted_class}`,
					{
						telemetryMessage:
							"durable object deleted class migration missing class",
					}
				);
			}
		});

		migration.renamed_classes?.forEach(({ from, to }) => {
			const useSQLite = durableObjectClassNameToUseSQLiteMap.get(from);
			if (useSQLite === undefined) {
				throw new UserError(
					`Cannot apply renamed_classes migration to non-existent class ${from}`,
					{
						telemetryMessage:
							"durable object renamed class migration missing class",
					}
				);
			} else {
				durableObjectClassNameToUseSQLiteMap.delete(from);
				durableObjectClassNameToUseSQLiteMap.set(to, useSQLite);
			}
		});

		migration.new_classes?.forEach((new_class) => {
			if (durableObjectClassNameToUseSQLiteMap.has(new_class)) {
				throw new UserError(
					`Cannot apply new_classes migration to existing class ${new_class}`,
					{
						telemetryMessage:
							"durable object new class migration existing class",
					}
				);
			} else {
				durableObjectClassNameToUseSQLiteMap.set(new_class, false);
			}
		});

		migration.new_sqlite_classes?.forEach((new_class) => {
			if (durableObjectClassNameToUseSQLiteMap.has(new_class)) {
				throw new UserError(
					`Cannot apply new_sqlite_classes migration to existing class ${new_class}`,
					{
						telemetryMessage:
							"durable object new sqlite class migration existing class",
					}
				);
			} else {
				durableObjectClassNameToUseSQLiteMap.set(new_class, true);
			}
		});
	});

	const durableObjectExports = getDurableObjectExports(exports ?? {});
	for (const [className, entry] of Object.entries(durableObjectExports)) {
		if (entry.type !== "durable-object") {
			continue;
		}
		if (
			entry.state === undefined ||
			entry.state === "created" ||
			entry.state === "expecting-transfer"
		) {
			durableObjectClassNameToUseSQLiteMap.set(
				className,
				entry.storage === "sqlite"
			);
		}
	}

	return durableObjectClassNameToUseSQLiteMap;
}
