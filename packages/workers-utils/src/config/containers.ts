import { UserError } from "../errors";
import { getDurableObjectExports } from "./durable-object-exports";
import type { ContainerApp, Exports } from "./environment";

/** Temporary Wrangler-owned image map until native Container image metadata is available. */
export const CONTAINER_IMAGES_BINDING =
	"EXPERIMENTAL_CLOUDFLARE_CONTAINER_IMAGES";

export type DurableObjectContainerApp = ContainerApp & {
	name: string;
	scheduling_policy: "durable_object";
};

export type ResolvedDurableObjectContainerApp = DurableObjectContainerApp & {
	class_name: string;
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
 * Resolve validated Durable Object-managed Containers to their owning classes.
 * Keep the original configuration unchanged so export-link validation can still
 * distinguish explicit class names from references through `exports`.
 *
 * @throws {UserError} If a Container is not linked to a Durable Object class.
 */
export function getResolvedDurableObjectContainerApps(
	containers: ContainerApp[] | undefined,
	exports: Exports | undefined
): ResolvedDurableObjectContainerApp[] {
	return getDurableObjectContainerApps(containers).map((container) => {
		const className = resolveContainerClassName(container, exports);
		if (typeof className !== "string" || className.length === 0) {
			throw new UserError(
				`The container "${container.name}" is not linked to a Durable Object. Either set "containers.class_name", or reference this container from a Durable Object's \`exports\` entry via its "container" field.`,
				{ telemetryMessage: "durable object container class unresolved" }
			);
		}
		return { ...container, class_name: className };
	});
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
