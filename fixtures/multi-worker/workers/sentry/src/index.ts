import * as Sentry from "@sentry/cloudflare";

export default Sentry.withSentry(
	(env: Env) => ({
		dsn: "https://foo@sentry.com/123456",
	}),
	{
		async fetch(request, env, ctx): Promise<Response> {
			console.log("Hello World!");
			return new Response("Hello World!");
		},
	} satisfies ExportedHandler<Env>
);
