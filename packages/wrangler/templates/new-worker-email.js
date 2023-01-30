/**
 * Welcome to Cloudflare Workers! This is your first Email worker.
 *
 * Learn more at https://developers.cloudflare.com/email-routing/email-workers/
 */

export default {
	async email(message, env, ctx) {
		console.log(`Hello World!`);
	},
};
