import type { LoaderFunctionArgs } from "@remix-run/cloudflare";

export async function loader({ context }: LoaderFunctionArgs) {
	const { env } = context.cloudflare;

	const { TEST } = env;

	return new Response(
		JSON.stringify({
			success: true,
			test: TEST,
		}),
		{
			status: 200,
			headers: {
				"Content-Type": "application/json",
			},
		},
	);
}
