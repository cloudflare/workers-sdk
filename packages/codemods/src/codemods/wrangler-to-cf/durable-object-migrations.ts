import {
	getRecords,
	getStrings,
	type UnknownRecord,
} from "./converter-helpers";

export interface InferredDurableObjectExport {
	state?: "deleted" | "renamed";
	storage?: "legacy-kv" | "sqlite";
	renamedTo?: string;
}

/** Infers current Durable Object exports and unresolved changes from ordered Wrangler migrations. */
export function inferDurableObjectExports(source: UnknownRecord): {
	exports: Map<string, InferredDurableObjectExport>;
	unresolved: string[];
} {
	const inferred = new Map<string, InferredDurableObjectExport>();
	const unresolved: string[] = [];
	for (const [index, migration] of getRecords(source, "migrations").entries()) {
		for (const name of getStrings(migration, "new_classes")) {
			inferred.set(name, { storage: "legacy-kv" });
		}
		for (const name of getStrings(migration, "new_sqlite_classes")) {
			inferred.set(name, { storage: "sqlite" });
		}
		for (const rename of getRecords(migration, "renamed_classes")) {
			if (typeof rename.from !== "string" || typeof rename.to !== "string") {
				unresolved.push(`migrations.${index}.renamed_classes`);
				continue;
			}
			const previous = inferred.get(rename.from);
			if (!previous?.storage) {
				unresolved.push(`migrations.${index}.renamed_classes.${rename.from}`);
				continue;
			}
			for (const [name, options] of inferred) {
				if (options.state === "renamed" && options.renamedTo === rename.from) {
					inferred.set(name, { state: "renamed", renamedTo: rename.to });
				}
			}
			inferred.set(rename.from, { state: "renamed", renamedTo: rename.to });
			inferred.set(rename.to, { storage: previous.storage });
		}
		for (const name of getStrings(migration, "deleted_classes")) {
			if (!inferred.has(name)) {
				unresolved.push(`migrations.${index}.deleted_classes.${name}`);
				continue;
			}
			for (const [alias, options] of inferred) {
				if (options.state === "renamed" && options.renamedTo === name) {
					inferred.set(alias, { state: "deleted" });
				}
			}
			inferred.set(name, { state: "deleted" });
		}
		if (getRecords(migration, "transferred_classes").length > 0) {
			unresolved.push(`migrations.${index}.transferred_classes`);
		}
	}
	return { exports: inferred, unresolved };
}
