export const onRequestGet = (context: { params: { id: string } }) =>
	new Response(`GET item ${context.params.id}`);

export const onRequestPost = (context: { params: { id: string } }) =>
	new Response(`POST item ${context.params.id}`);
