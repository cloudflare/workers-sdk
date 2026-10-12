import { kVoid } from "../../runtime/config/workerd";
import { kUnsafeEphemeralUniqueKey } from "../shared/unsafe-unique-key";
import type {
	Worker_DurableObjectNamespace,
	Worker_DurableObjectNamespace_ContainerOptions_ContainerPrivileges,
} from "../../runtime/config/workerd";
import type { DurableObjectClassNames } from "../shared";
import type { UnsafeUniqueKey } from "../shared/unsafe-unique-key";

type DurableObjectClasses = NonNullable<
	ReturnType<DurableObjectClassNames["get"]>
>;

/**
 * Returns the key workerd uses to identify a Durable Object class.
 *
 * @param className Durable Object class name.
 * @param workerName Worker containing the class.
 * @param unsafeUniqueKey Explicit key override.
 */
export function getDurableObjectUniqueKey(
	className: string,
	workerName: string | undefined,
	unsafeUniqueKey: UnsafeUniqueKey | undefined
): string | undefined {
	if (unsafeUniqueKey === kUnsafeEphemeralUniqueKey) {
		return undefined;
	}

	return unsafeUniqueKey ?? `${workerName ?? ""}-${className}`;
}

/**
 * Converts parsed Durable Object classes into workerd namespaces.
 *
 * @param classNames Classes exported by one worker.
 * @param workerName Worker containing the classes.
 * @param containerPrivileges Privileges allowed for local containers.
 */
export function getDurableObjectNamespaces(
	classNames: DurableObjectClasses | undefined,
	workerName: string | undefined,
	containerPrivileges:
		| Worker_DurableObjectNamespace_ContainerOptions_ContainerPrivileges
		| undefined
): Worker_DurableObjectNamespace[] {
	return Array.from(classNames ?? []).map(
		([
			className,
			{
				enableSql,
				unsafeUniqueKey,
				unsafePreventEviction: preventEviction,
				container,
			},
		]) => {
			const uniqueKey = getDurableObjectUniqueKey(
				className,
				workerName,
				unsafeUniqueKey
			);
			const containerOptions =
				container === undefined
					? undefined
					: { ...container, privileges: containerPrivileges };

			return uniqueKey === undefined
				? {
						className,
						enableSql,
						ephemeralLocal: kVoid,
						preventEviction,
						container: containerOptions,
					}
				: {
						className,
						enableSql,
						uniqueKey,
						preventEviction,
						container: containerOptions,
					};
		}
	);
}
