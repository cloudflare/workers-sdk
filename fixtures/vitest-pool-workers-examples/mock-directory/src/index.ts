import { getValue } from "./dep";

export function greet(): string {
	return `Hello, ${getValue()}!`;
}

export default {
	async fetch() {
		return new Response(greet());
	},
} satisfies ExportedHandler;
