import { configFileName } from "../config";
import { UserError } from "../errors";
import type { Config } from "../config";
import type { DevProps } from "./dev";

export function validateDevProps(props: Omit<DevProps, "host">) {
	if (
		!props.isWorkersSite &&
		props.legacyAssetPaths &&
		props.entry.format === "service-worker"
	) {
		throw new UserError(
			"You cannot use the service-worker format with an `assets` directory yet. For information on how to migrate to the module-worker format, see: https://developers.cloudflare.com/workers/learning/migrating-to-module-workers/"
		);
	}

	if (props.bindings.wasm_modules && props.entry.format === "modules") {
		throw new UserError(
			"You cannot configure [wasm_modules] with an ES module worker. Instead, import the .wasm module directly in your code"
		);
	}

	if (props.bindings.text_blobs && props.entry.format === "modules") {
		throw new UserError(
			`You cannot configure [text_blobs] with an ES module worker. Instead, import the file directly in your code, and optionally configure \`[rules]\` in your ${configFileName(props.rawConfig.configPath)} file`
		);
	}

	if (props.bindings.data_blobs && props.entry.format === "modules") {
		throw new UserError(
			`You cannot configure [data_blobs] with an ES module worker. Instead, import the file directly in your code, and optionally configure \`[rules]\` in your ${configFileName(props.rawConfig.configPath)} file`
		);
	}
}

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
