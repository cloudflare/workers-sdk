// @ts-expect-error non standard module
import data from "../some-data.bin";
// @ts-expect-error non standard module
import text from "../some-text.txt";

declare global {
	const process: { env: { NODE_ENV: string } };
}

export default {
	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	async fetch(_request: Request, env: any): Promise<Response> {
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
	},
};
