import { UserError } from "@cloudflare/workers-utils";
import type { Config } from "@cloudflare/workers-utils";

/**
 * Based on the migrations and / or declarative `exports` config, infer the
 * Durable Object class names defined by this Worker and whether each uses
 * SQLite-backed storage.
 *
 * This includes both bound and unbound (i.e. `ctx.exports`) classes.
 *
 * `migrations` and `exports` are mutually exclusive at the config-validation
 * boundary, but this function tolerates both being present defensively.
 *
 * The `exports` config — when set — contributes one entry per live
 * `durable-object` export: `state: "created"` (the default) and
 * `state: "expecting-transfer"` are both treated as live for local-dev
 * purposes. Tombstone states (`deleted`, `renamed`, `transferred`) are
 * skipped because they retire the namespace from this script.
 *
 * Returns a map of class name → `true` when SQLite storage is selected,
 * `false` for legacy KV storage.
 */
export function getDurableObjectClassNameToUseSQLiteMap(
	migrations: Config["migrations"] | undefined,
	exports?: Config["exports"] | undefined
) {
	const durableObjectClassNameToUseSQLiteMap = new Map<string, boolean>();
	(migrations || []).forEach((migration) => {
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

	// Apply declarative `exports` entries. Live entries (`created` /
	// `expecting-transfer`) declare a class + storage backend; tombstones
	// retire a namespace and don't contribute a live class to local dev.
	if (exports) {
		for (const [className, entry] of Object.entries(exports)) {
			if (entry.type !== "durable-object") {
				continue;
			}
			// `state` defaults to `"created"` on the wire when omitted. Both
			// `"created"` and `"expecting-transfer"` are live states and carry
			// a `storage` field — narrow on `entry.state` directly so TS picks
			// the right discriminant.
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
	}

	return durableObjectClassNameToUseSQLiteMap;
}
