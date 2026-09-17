// Keep the destination fixed to prevent this Worker from becoming an open proxy.
const PROXY_URL = 'https://example.com/';

export default {
	async fetch(request, env, ctx): Promise<Response> {
		const url = new URL(request.url);

		const modify = url.searchParams.has('modify'); // check if a query param is set (?modify)

		// make subrequests with the global `fetch()` function
		let res = await fetch(PROXY_URL, request);

		// optionally, modify the respone
		if (modify) {
			res = new Response(res.body, res);
			res.headers.set('X-My-Header', 'My Header Value');
		}

		return res;
	},
} satisfies ExportedHandler<Env>;
