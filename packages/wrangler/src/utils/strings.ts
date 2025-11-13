/**
 * Converts the first letter of a string to uppercase
 *
 * @param str The input string
 * @returns The capitalized string
 */
export function capitalize<S extends string>(str: S): Capitalize<S> {
	return (
		str.length > 0 ? str[0].toUpperCase() + str.substring(1) : str
	) as Capitalize<S>;
}
