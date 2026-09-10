import { UserError } from "../errors";
import { getDurableObjectExports } from "./durable-object-exports";
import type { Config } from "./config";
import type { ContainerApp, Exports } from "./environment";

/** Temporary Wrangler-owned image map until native Container image metadata is available. */
export const CONTAINER_IMAGES_BINDING =
	"EXPERIMENTAL_CLOUDFLARE_CONTAINER_IMAGES";

export type DurableObjectContainerApp = ContainerApp & {
	class_name: string;
	name: string;
	scheduling_policy: "durable_object";
};

export function isDurableObjectContainerApp(
	container: ContainerApp
): container is DurableObjectContainerApp {
	return container.scheduling_policy === "durable_object";
}

export function getDurableObjectContainerApps(
	containers: ContainerApp[] | undefined
): DurableObjectContainerApp[] {
	return Array.isArray(containers)
		? containers.filter(isDurableObjectContainerApp)
		: [];
}

/**
 * A container can be linked to a Durable Object from either direction:
 *
 *  - the container names the class via `containers[].class_name`, or
 *  - the Durable Object names the container via `exports[Class].container`.
 *
 * This returns the second direction as a lookup of container name to Durable
 * Object class name. Only live `durable-object` exports can attach a container,
 * so tombstones are ignored.
 *
 * When two exports name the same container the first wins. That is a config
 * error caught during validation, so the choice only affects which class a
 * rejected config reports.
 */
export function getContainerNameToClassNameMap(
	exports: Exports | undefined
): Map<string, string> {
	const containerNameToClassName = new Map<string, string>();

	for (const [className, entry] of Object.entries(
		getDurableObjectExports(exports)
	)) {
		if (
			"container" in entry &&
			typeof entry.container === "string" &&
			!containerNameToClassName.has(entry.container)
		) {
			containerNameToClassName.set(entry.container, className);
		}
	}

	return containerNameToClassName;
}

/**
 * The Durable Object class a container backs, resolved from either direction of
 * the container/Durable Object link.
 *
 * Returns `undefined` when the container is not linked to a Durable Object at
 * all, which validation rejects.
 */
export function resolveContainerClassName(
	container: Pick<ContainerApp, "class_name" | "name">,
	exports: Exports | undefined
): string | undefined {
	if (container.class_name !== undefined) {
		return container.class_name;
	}
	if (container.name === undefined) {
		return undefined;
	}
	return getContainerNameToClassNameMap(exports).get(container.name);
}

/**
 * The set of Durable Object class names that have a container attached, resolved
 * from either direction of the container/Durable Object link.
 */
export function getContainerDurableObjectClassNames(
	containers: ContainerApp[] | undefined,
	exports: Exports | undefined
): Set<string> {
	const classNames = new Set<string>();

	for (const container of containers ?? []) {
		const className = resolveContainerClassName(container, exports);
		if (className !== undefined) {
			classNames.add(className);
		}
	}

	return classNames;
}

/**
 * Infer Durable Object class names and storage backends from migrations and
 * live declarative `exports` entries.
 *
 * In practice only one of `migrations` or `exports` will have the Durable Object configuration.
 */
export function getDurableObjectClassNameToUseSQLiteMap(
	migrations: Config["migrations"] | undefined,
	exports?: Config["exports"] | undefined
): Map<string, boolean> {
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

/**
 * Validate that every Durable Object-managed container belongs to this Worker.
 */
export function validateDurableObjectContainerApplications(
	config: Config
): void {
	const allDOs = getDurableObjectClassNameToUseSQLiteMap(
		config.migrations,
		config.exports
	);

	for (const container of getDurableObjectContainerApps(config.containers)) {
		const maybeBoundDO = config.durable_objects.bindings.find(
			(durableObject) => durableObject.class_name === container.class_name
		);
		const useSQLite = allDOs.get(container.class_name);
		if (useSQLite === undefined && maybeBoundDO === undefined) {
			throw new UserError(
				`The container class_name ${container.class_name} does not match any durable object class_name defined in your Wrangler config file. Note that the durable object must be defined in the same script as the container.`,
				{ telemetryMessage: "no DO defined that matches container class_name" }
			);
		}
		if (maybeBoundDO?.script_name !== undefined) {
			throw new UserError(
				`The container ${container.name} is referencing the durable object ${container.class_name}, which appears to be defined on the ${maybeBoundDO.script_name} Worker instead (via the 'script_name' field). You cannot configure a container on a Durable Object that is defined in another Worker.`,
				{
					telemetryMessage:
						"container class_name refers to an external durable object",
				}
			);
		}
		if (useSQLite === false) {
			throw new UserError(
				`The container ${container.name} references Durable Object class ${container.class_name}, which uses the legacy KV storage backend. Durable Object-managed Containers require SQLite-backed Durable Objects.`,
				{
					telemetryMessage:
						"durable object container class uses legacy storage",
				}
			);
		}
	}
}
