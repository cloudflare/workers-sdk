const originalFetch = fetch;

// Monkeypatch `fetch()`. This looks like a no-op, but it's not. It allows MSW to intercept fetch calls using it's Fetch interceptor.
globalThis.fetch = async (input, init) => {
	return originalFetch.call(globalThis, input, init);
};
