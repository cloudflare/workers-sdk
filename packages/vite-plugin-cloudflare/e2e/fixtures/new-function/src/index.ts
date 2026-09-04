const createMessage = new Function("return () => 'new-function-ok'");
const message = createMessage() as () => string;

export default {
	fetch() {
		return new Response(message());
	},
} satisfies ExportedHandler;
