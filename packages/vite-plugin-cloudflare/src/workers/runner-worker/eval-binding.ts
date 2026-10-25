/**
 * Provide indirect eval for development stack reconstruction in the module runner.
 * @param evaluate - The runner's existing local code evaluation binding.
 */
export function installIndirectEval(
	evaluate: (source: string) => unknown
): void {
	globalThis.eval = (source) =>
		typeof source === "string" ? evaluate(source) : source;
}
