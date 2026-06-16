/**
 * The resource name that auto-provisioning will create for a given binding.
 */
export function autoProvisionedResourceName(
	scriptName: string,
	bindingName: string
): string {
	return `${scriptName}-${bindingName.toLowerCase().replaceAll("_", "-")}`;
}
