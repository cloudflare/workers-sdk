export async function GET({ platform }) {
	const test = platform?.env.TEST;

	return new Response(JSON.stringify({ test }), {
		headers: {
			"Content-Type": "application/json",
		},
	});
}
