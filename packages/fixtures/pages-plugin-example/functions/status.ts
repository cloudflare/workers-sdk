export const onRequest = () => {
	return new Response("This should return a 502 status code", { status: 502 });
};
