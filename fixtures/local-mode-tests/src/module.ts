// Because we have the `buffer` npm package installed, this shouldn't fail,
// as esbuild can resolve that instead:
// https://github.com/cloudflare/workers-sdk/issues/2038
import { Buffer } from "buffer";

// @ts-expect-error non standard module
import data from "./some-data.bin";
// @ts-expect-error non standard module
import text from "./some-text.txt";

type Env = {
	VAR1: string;
	VAR2: string;
	VAR3: string;
	VAR4: string;
};

export default {
	async fetch(request: Request, env: Env): Promise<Response> {
		const url = new URL(request.url);
		let greeting = "Hi!";

		switch (request.headers.get("lang")) {
			case "fr-FR":
				greeting = "Bonjour!";
				break;
			case "en-AU":
				greeting = "G'day!";
				break;
			case "en-US":
				greeting = "Hello!";
				break;
			case "en-GB":
				greeting = "Good day!";
				break;
			//en-TX isn't a real locale, but it's a fun one to have
			case "en-TX":
				greeting = "Howdy!";
				break;
			case "es-ES":
				greeting = "Hola!";
				break;

			default:
				break;
		}

		if (url.pathname === "/vars") {
			return new Response(
				JSON.stringify(
					{
						VAR1: env.VAR1,
						VAR2: env.VAR2,
						VAR3: env.VAR3,
						VAR4: env.VAR4,
						text,
						data: new TextDecoder().decode(data),
						NODE_ENV: process.env.NODE_ENV,
					},
					null,
					2
				)
			);
		}
		if (url.pathname === "/buffer") {
			return new Response(Buffer.from("hello").toString("hex"));
		}

		return new Response(
			JSON.stringify({
				greeting,
			})
		);
	},
};
