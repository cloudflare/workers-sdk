export const onRequest: PagesFunction<Env, never, Data> = ({ request }) => {
	return new Response(`${request.method} pong`);
};
