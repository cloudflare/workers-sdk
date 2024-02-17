/**
 * Strips a name to a valid binding name which must be a valid JS identifiers.
 * Removes any non-alphanumeric and non-underscore characters and prepends an underscore if it starts with a number.
 */
export function getValidBindingName(name: string) {
	let bindingName = name.replace(/[\s-]/g, "_").replace(/[^a-zA-Z0-9_]/g, "");

	if (/^[0-9]/.test(bindingName)) {
		bindingName = "_" + bindingName;
	}

	return bindingName;
}
