import staticFormsPlugin from '@cloudflare/pages-plugin-static-forms';

// Easily process form submissions with pages-plugin-static-form
export const onRequest: PagesFunction = staticFormsPlugin({
	respondWith: ({ formData, name }) => {
		const email = formData.get('email');

		// TODO: process the form data, for example save to KV or send an email
		return new Response(`Hello, ${email}! Thank you for submitting the ${name} form.`);
	},
});
