export const jsonFetcher = (...args: Parameters<typeof fetch>) =>
	fetch(...args).then(response => response.json());
