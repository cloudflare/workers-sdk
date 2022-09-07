export default {
	async fetch(req: Request): Promise<Response> {
		let greeting = "Hi!";
		const { headers } = req;

		switch (headers.get("lang")) {
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

		return new Response(
			JSON.stringify({
				greeting,
			})
		);
	},
};
