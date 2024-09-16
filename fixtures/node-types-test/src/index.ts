export default {
	async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
		// Section 1: Request handling
		const newReq = new Request('https://example.com', request);
		console.log(newReq.cf); // Workers-specific property

		// Section 2: Response handling
		const res = await fetch(newReq);
		console.log(res.cf); // Workers-specific property

		// Section 3: Static Response methods
		const res2 = Response.json({ bool: true });
		console.log(res2.cf); // Workers-specific property

		// Section 4: Generic type usage with Response
		const json = await res.json<{ bool: boolean }>();

		// Section 6: Returning a Response
		return fetch(newReq);
	},
};
