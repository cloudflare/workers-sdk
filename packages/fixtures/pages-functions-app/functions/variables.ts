export const onRequest = ({ env }) => {
	return new Response(JSON.stringify(env), {
		headers: { "Content-Type": "application/json" },
	});
};
