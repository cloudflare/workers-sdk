import { unstable_DEFAULT_MODULE_RULES } from "wrangler";
import { ADDITIONAL_MODULE_TYPES } from "./constants";

type AdditionalModuleType = (typeof ADDITIONAL_MODULE_TYPES)[number];

const matchers = unstable_DEFAULT_MODULE_RULES.flatMap((rule) =>
	ADDITIONAL_MODULE_TYPES.includes(rule.type as AdditionalModuleType)
		? rule.globs.map((glob) => {
				const extension = glob.slice(glob.lastIndexOf("."));

				return (source: string) =>
					source.endsWith(extension)
						? (rule.type as AdditionalModuleType)
						: null;
			})
		: []
);

export function matchAdditionalModule(source: string) {
	for (const matcher of matchers) {
		const moduleType = matcher(source);

		if (moduleType) {
			return moduleType;
		}
	}

	return null;
}

export function createModuleReference(type: AdditionalModuleType, id: string) {
	return `__CLOUDFLARE_MODULE__${type}__${id}__`;
}
