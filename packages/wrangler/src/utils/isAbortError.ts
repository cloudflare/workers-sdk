/**
 * Checking whether an error is an AbortError has changed.
 * There is a legacy use of `.code`
 * and a (mdn status: experimental) use of `.name`
 *
 * See MDN for more information:
 * https://developer.mozilla.org/en-US/docs/Web/API/DOMException#aborterror
 */
export function isAbortError(err: unknown) {
	const legacyAbortErroCheck = (err as { code: string }).code == "ABORT_ERR";
	const abortErrorCheck = err instanceof Error && err.name == "AbortError";

	return legacyAbortErroCheck || abortErrorCheck;
}

/**
 * Mutate an Error instance so it passes either of the checks in isAbortError
 */
export function castAsAbortError(err: Error) {
	(err as Error & { code: string }).code = "ABORT_ERR";
	err.name = "AbortError";
}
