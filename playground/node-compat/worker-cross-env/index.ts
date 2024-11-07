import crossFetch, { Headers } from 'cross-fetch';

export default {
	async fetch(
		request: Request,
		env: Env,
		ctx: ExecutionContext,
	): Promise<Response> {
		return testImportUenvAliasedPackages();
	},
};

async function testImportUenvAliasedPackages() {
	const errors = [];
	if (typeof crossFetch !== 'function') {
		errors.push(
			'Expected `fetch` to be a function (default export) but got ' +
				typeof crossFetch,
		);
	}

	if (typeof Headers !== 'function') {
		errors.push(
			'Expected `Headers` to be a function (named export) but got ' +
				typeof Headers,
		);
	}

	if (errors.length > 0) {
		return new Response(
			'NOT OK:\n' + errors.length + errors.join('\n') + '...',
		);
	}
	return new Response(`"OK!"`);
}
