export default {
	async fetch(request: Request, env: { SERVICE: Fetcher }) {
		const serviceResp = await env.SERVICE.fetch(request);
		const serviceRespTxt = await serviceResp.text();
		return new Response(
			`Hello from module worker b and also: ${serviceRespTxt}`
		);
	},
};
