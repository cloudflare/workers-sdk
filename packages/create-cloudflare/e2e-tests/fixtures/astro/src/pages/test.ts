import type { APIRoute } from "astro";

export const GET: APIRoute = async ({ locals }) => {
	const { TEST } = locals.runtime.env;

	return new Response(JSON.stringify({ test: TEST }), {
		status: 200,
	});
};
