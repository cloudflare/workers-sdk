// @ts-expect-error non standard module
import data from "./some-data.bin";
// @ts-expect-error non standard module
import text from "./some-text.txt";

addEventListener("fetch", (event: FetchEvent) => {
	event.respondWith(handleRequest(event.request));
});

async function handleRequest(_req: Request): Promise<Response> {
	return new Response(
		JSON.stringify(
			{
				// @ts-expect-error binding
				VAR1,
				// @ts-expect-error binding
				VAR2,
				// @ts-expect-error binding
				VAR3,
				text,
				data: new TextDecoder().decode(data),
				// @ts-expect-error binding
				TEXT,
				// @ts-expect-error binding
				DATA: new TextDecoder().decode(DATA),
				NODE_ENV: process.env.NODE_ENV,
			},
			null,
			2
		)
	);
}
