import { UserError } from "@cloudflare/workers-utils";
import type { Config } from "@cloudflare/workers-utils";

/**
 * Based on the migrations, infer what the current Durable Object class names are.
 * This includes unbound (ctx.exports) and bound DOs.
 * Returns class name mapped to whether it uses SQLite storage.
 * This is imperfect because you can delete a migration after it has been applied.
 */
export function getDurableObjectClassNameToUseSQLiteMap(
	migrations: Config["migrations"] | undefined
) {
	const durableObjectClassNameToUseSQLiteMap = new Map<string, boolean>();
	(migrations || []).forEach((migration) => {
		migration.deleted_classes?.forEach((deleted_class) => {
			if (!durableObjectClassNameToUseSQLiteMap.delete(deleted_class)) {
				throw new UserError(
					`Cannot apply deleted_classes migration to non-existent class ${deleted_class}`
				);
			}
		});

		migration.renamed_classes?.forEach(({ from, to }) => {
			const useSQLite = durableObjectClassNameToUseSQLiteMap.get(from);
			if (useSQLite === undefined) {
				throw new UserError(
					`Cannot apply renamed_classes migration to non-existent class ${from}`
				);
			} else {
				durableObjectClassNameToUseSQLiteMap.delete(from);
				durableObjectClassNameToUseSQLiteMap.set(to, useSQLite);
			}
		});

		migration.new_classes?.forEach((new_class) => {
			if (durableObjectClassNameToUseSQLiteMap.has(new_class)) {
				throw new UserError(
					`Cannot apply new_classes migration to existing class ${new_class}`
				);
			} else {
				durableObjectClassNameToUseSQLiteMap.set(new_class, false);
			}
		});

		migration.new_sqlite_classes?.forEach((new_class) => {
			if (durableObjectClassNameToUseSQLiteMap.has(new_class)) {
				throw new UserError(
					`Cannot apply new_sqlite_classes migration to existing class ${new_class}`
				);
			} else {
				durableObjectClassNameToUseSQLiteMap.set(new_class, true);
			}
		});
	});

	return durableObjectClassNameToUseSQLiteMap;
}
