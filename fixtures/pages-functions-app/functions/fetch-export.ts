export const onRequestGet = () => new Response("hello from an onRequestGet!");

export default {
	fetch() {
		return new Response("hello from a fetch handler!");
	},
};
