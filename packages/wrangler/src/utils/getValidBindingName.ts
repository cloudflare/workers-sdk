/**
 * Strips a name to a valid binding name which must be a valid JS identifiers.
 * Removes any non-alphanumeric and non-underscore characters and prepends an underscore if it starts with a number.
 * @returns A stripped binding name or a fallback if a valid binding name is not possible.
 */
export function getValidBindingName(name: string, fallback: string) {
	// replace whitespaces and dashes with underscores
	let bindingName = name.replace(/[\s-]/g, "_");

	// remove all non-alphanumeric and non-underscore characters
	bindingName = bindingName.replace(/[^a-zA-Z0-9_]/g, "");

	// replace consecutive underscores with single underscore
	bindingName = bindingName.replace(/_+/g, "_");

	// prepend an underscore if it starts with a number
	if (/^[0-9]/.test(bindingName)) {
		bindingName = "_" + bindingName;
	}

	// fallback if output is empty or only underscores
	if (!bindingName.length || /^_+$/.test(bindingName)) {
		return fallback;
	}

	return bindingName;
}
