export const CORE_PLUGIN_NAME = "core";

// Service for HTTP socket entrypoint (for checking runtime ready, routing, etc)
export const SERVICE_ENTRY = `${CORE_PLUGIN_NAME}:entry`;
// Service prefix for all regular user workers
const SERVICE_USER_PREFIX = `${CORE_PLUGIN_NAME}:user`;
// Service prefix for `workerd`'s builtin services (network, external, disk)
const SERVICE_BUILTIN_PREFIX = `${CORE_PLUGIN_NAME}:builtin`;
// Service prefix for custom fetch functions defined in `serviceBindings` option
const SERVICE_CUSTOM_PREFIX = `${CORE_PLUGIN_NAME}:custom`;

export function getUserServiceName(workerName = "") {
	return `${SERVICE_USER_PREFIX}:${workerName}`;
}
export function getBuiltinServiceName(
	workerIndex: number,
	bindingName: string
) {
	return `${SERVICE_BUILTIN_PREFIX}:${workerIndex}:${bindingName}`;
}
export function getCustomServiceName(workerIndex: number, bindingName: string) {
	return `${SERVICE_CUSTOM_PREFIX}:${workerIndex}:${bindingName}`;
}
