const util = require("node:util");

// `PendingInterceptorsFormatter` without dependency on `Console#table()`
module.exports = class PendingInterceptorsFormatter {
	constructor({ disableColors } = {}) {
		this.inspectOptions = {
			breakLength: Infinity,
			colors: !disableColors && !process.env.CI,
		};
	}

	format(pendingInterceptors) {
		const formatted = pendingInterceptors.map(
			({
				method,
				path,
				data: { statusCode },
				persist,
				times,
				timesInvoked,
				origin,
			}) => {
				const meta = {
					persist: Boolean(persist),
					invoked: timesInvoked,
					remaining: persist ? Infinity : times - timesInvoked,
				};
				const inspectedMeta = util.inspect(meta, this.inspectOptions);
				return `- ${method} ${origin}${path} ${statusCode} ${inspectedMeta}`;
			}
		);
		return formatted.join("\n");
	}
};
