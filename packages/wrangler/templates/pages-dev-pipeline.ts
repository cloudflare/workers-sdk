// @ts-ignore entry point will get replaced
import worker from "__ENTRY_POINT__";
// @ts-ignore entry point will get replaced
export * from "__ENTRY_POINT__";

const transformToRegex = (filter: string) => {
	return filter.replace("*", ".*");
};

const routes = {
	// @ts-ignore routes are injected
	include: __ROUTES__.include.map(transformToRegex),
	// @ts-ignore routes are injected
	exclude: __ROUTES__.exclude.map(transformToRegex) || [],
};

export default {
	fetch(request, env, context) {
		const { pathname } = new URL(request.url);

		for (const exclude of routes.exclude) {
			if (pathname.match(exclude)) {
				return env.ASSETS.fetch(request);
			}
		}

		for (const include of routes.include) {
			if (pathname.match(include)) {
				return worker.fetch(request, env, context);
			}
		}

		return env.ASSETS.fetch(request);
	},
};
