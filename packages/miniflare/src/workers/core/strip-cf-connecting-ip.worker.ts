export default {
	fetch(request) {
		const headers = new Headers(request.headers);
		headers.delete("CF-Connecting-IP");
		return fetch(request, { headers });
	},
} satisfies ExportedHandler;
