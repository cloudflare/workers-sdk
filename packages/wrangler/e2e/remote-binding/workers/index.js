export default {
	async fetch(request, env) {
		const testModule = request.headers.get("x-test-module");
		const fetcher = await import(testModule);
		return fetcher.default.fetch(request, env);
	},
};
