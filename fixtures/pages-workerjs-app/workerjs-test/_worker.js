import text from './other-script'

export default {
	async fetch() {
		return new Response(text);
	}
}
