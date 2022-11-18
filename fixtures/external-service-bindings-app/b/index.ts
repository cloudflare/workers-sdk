export default {
	fetch(request: Request, env: { SERVICE: Fetcher }) {
		return env.SERVICE.fetch(request);
	},
};
