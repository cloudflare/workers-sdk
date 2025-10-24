import { UserError } from "@cloudflare/workers-utils";
import type { Config } from "@cloudflare/workers-utils";

export function getClassNamesWhichUseSQLite(
	migrations: Config["migrations"] | undefined
) {
	const classNamesWhichUseSQLite = new Map<string, boolean>();
	(migrations || []).forEach((migration) => {
		migration.deleted_classes?.forEach((deleted_class) => {
			if (!classNamesWhichUseSQLite.delete(deleted_class)) {
				throw new UserError(
					`Cannot apply deleted_classes migration to non-existent class ${deleted_class}`
				);
			}
		});

		migration.renamed_classes?.forEach(({ from, to }) => {
			const useSQLite = classNamesWhichUseSQLite.get(from);
			if (useSQLite === undefined) {
				throw new UserError(
					`Cannot apply renamed_classes migration to non-existent class ${from}`
				);
			} else {
				classNamesWhichUseSQLite.delete(from);
				classNamesWhichUseSQLite.set(to, useSQLite);
			}
		});

		migration.new_classes?.forEach((new_class) => {
			if (classNamesWhichUseSQLite.has(new_class)) {
				throw new UserError(
					`Cannot apply new_classes migration to existing class ${new_class}`
				);
			} else {
				classNamesWhichUseSQLite.set(new_class, false);
			}
		});

		migration.new_sqlite_classes?.forEach((new_class) => {
			if (classNamesWhichUseSQLite.has(new_class)) {
				throw new UserError(
					`Cannot apply new_sqlite_classes migration to existing class ${new_class}`
				);
			} else {
				classNamesWhichUseSQLite.set(new_class, true);
			}
		});
	});

	return classNamesWhichUseSQLite;
}
