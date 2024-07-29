const ORIGIN_URL = 'https://example.com';
const EXPERIMENTS = [
	{ name: 'big-button', threshold: 0.5 }, // enable the Big Button experiment for 50% of users
	{ name: 'new-brand', threshold: 0.1 }, // enable the New Brand experiment for 10% of users
	{ name: 'new-layout', threshold: 0.02 }, // enable the New Layout experiment for 2% of users
];

export default {
	async fetch(request, env, ctx) {
		const fingerprint = [request.headers.get('cf-connecting-ip'), request.cf?.postalCode]; // add any values you want considered as a fingerprint
		const activeExperiments = await getActiveExperiments(fingerprint, EXPERIMENTS);

		// add a data-experiments attribute to the <body> tag
		// which can be styled in CSS with a wildcard selector like [data-experiments*="big-button"]
		const rewriter = new HTMLRewriter().on('body', {
			element(element) {
				element.setAttribute('data-experiments', activeExperiments.join(' '));
			},
		});

		const res = await fetch(ORIGIN_URL, request);

		return rewriter.transform(res);
	},
};

// Get active experiments by hashing a fingerprint
async function getActiveExperiments(fingerprint, experiments) {
	const fingerprintHash = await hash('SHA-1', JSON.stringify(fingerprint));
	const MAX_UINT8 = 255;
	const activeExperiments = experiments.filter((exp, i) => fingerprintHash[i] <= exp.threshold * MAX_UINT8);
	return activeExperiments.map((exp) => exp.name);
}

// Hash a string using the Web Crypto API
async function hash(algorithm, message) {
	const msgUint8 = new TextEncoder().encode(message); // encode as (utf-8) Uint8Array
	const hashBuffer = await crypto.subtle.digest(algorithm, msgUint8); // hash the message
	const hashArray = new Uint8Array(hashBuffer); // convert buffer to byte array
	return hashArray;
}
