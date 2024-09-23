export default {
	fetch: (request: any, env: any, ctx: any) => {
		return Response.json(request.cf);
	},
};
