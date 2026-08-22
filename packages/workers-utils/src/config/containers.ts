import { getDurableObjectExports } from "./durable-object-exports";
import type {
	ContainerApp,
	ContainerInstanceGroupConfig,
	Exports,
} from "./environment";

export type ContainerInstanceGroupExport = {
	className: string;
	config: ContainerInstanceGroupConfig;
};

export function isContainerInstanceGroupConfig(
	container: unknown
): container is ContainerInstanceGroupConfig {
	return (
		typeof container === "object" &&
		container !== null &&
		!Array.isArray(container)
	);
}

export function getContainerInstanceGroupExports(
	exports: Exports | undefined
): ContainerInstanceGroupExport[] {
	const groups: ContainerInstanceGroupExport[] = [];

	for (const [className, entry] of Object.entries(
		getDurableObjectExports(exports)
	)) {
		if (
			(entry.state === undefined ||
				entry.state === "created" ||
				entry.state === "expecting-transfer") &&
			"container" in entry &&
			isContainerInstanceGroupConfig(entry.container)
		) {
			groups.push({ className, config: entry.container });
		}
	}

	return groups;
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
