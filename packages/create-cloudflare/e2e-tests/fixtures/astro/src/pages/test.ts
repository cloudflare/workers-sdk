import type { APIRoute } from "astro";

export const prerender = false;

export const GET: APIRoute = async ({ locals }) => {
	const { TEST } = locals.runtime.env;

	return new Response(JSON.stringify({ test: TEST }), {
		status: 200,
	});
};
