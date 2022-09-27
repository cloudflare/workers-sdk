// https://github.com/whatwg/fetch/issues/905#issuecomment-491970649
export function anyAbortSignal(...signals: AbortSignal[]): AbortSignal {
	const controller = new AbortController();

	function handleAbort() {
		controller.abort();
		for (const signal of signals) {
			signal.removeEventListener("abort", handleAbort);
		}
	}

	for (const signal of signals) {
		if (signal.aborted) {
			handleAbort();
			break;
		}
		signal.addEventListener("abort", handleAbort);
	}

	return controller.signal;
}
