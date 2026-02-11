import type { Binding } from "../api";

/**
 * a function that takes an array of strings in `key:value` format
 * (typically from yargs or config) and returns back
 * a neat object with the keys and values
 */
export function collectKeyValues(array?: string[]) {
	return (
		array?.reduce<Record<string, string>>((recordsToCollect, v) => {
			const [key, ...value] = v.split(":");
			recordsToCollect[key] = value.join(":");
			return recordsToCollect;
		}, {}) || {}
	);
}

/**
 * Collects `key:value` strings into plain_text bindings marked as hidden.
 * Used for CLI `--var` args, whose values should not be printed to the terminal.
 */
export function collectPlainTextVars(
	array?: string[]
): Record<string, Extract<Binding, { type: "plain_text" }>> {
	return (
		array?.reduce<Record<string, Extract<Binding, { type: "plain_text" }>>>(
			(recordsToCollect, v) => {
				const [key, ...value] = v.split(":");
				recordsToCollect[key] = {
					type: "plain_text",
					value: value.join(":"),
					hidden: true,
				};
				return recordsToCollect;
			},
			{}
		) || {}
	);
}
