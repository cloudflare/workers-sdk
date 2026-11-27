import { env } from "cloudflare:workers";

export async function GET() {
	const test = env.TEST;

	return new Response(JSON.stringify({ test }), {
		headers: {
			"Content-Type": "application/json",
		},
	});
}
