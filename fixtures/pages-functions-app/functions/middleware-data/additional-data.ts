export const onRequest = [
	async (context) => {
		context.data.foo = "bar";
		return await context.next();
	},
	async (context) => {
		return Response.json(context.data);
	},
];
