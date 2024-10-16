export default {
	async fetch(request) {
		console.log('console log');
		console.warn('console warn');
		console.error('console error');
		return Response.json({ status: 'OK' });
	},
} satisfies ExportedHandler;
