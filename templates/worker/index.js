export default {
	fetch() {
		return new Response('Hello worker!', {
			headers: {
				'content-type': 'text/plain',
			},
		});
	},
};
