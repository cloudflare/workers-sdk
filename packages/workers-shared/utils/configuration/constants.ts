export const REDIRECTS_VERSION = 1;
/**
 * The maximum length of a single rule in the redirects file, enforced in EWC.
 * The length is excluding comments.
 */
export const MAX_REDIRECT_LINE_LENGTH = 1000;
export const MAX_REDIRECT_DYNAMIC_RULES = 100;
export const MAX_REDIRECT_STATIC_RULES = 2000;
export const REDIRECT_SPLAT_REGEX = /\*/g;
export const REDIRECT_PLACEHOLDER_REGEX = /:[A-Za-z]\w*/g;
export const REDIRECT_PERMITTED_STATUS_CODES = new Set([
	200, 301, 302, 303, 307, 308,
]);

export const HEADERS_VERSION = 2;
export const MAX_HEADER_RULES = 100;
export const MAX_HEADER_LINE_LENGTH = 2000;
export const HEADER_UNSET_OPERATOR = "! ";
export const HEADER_SEPARATOR = ":";

/** Max number of rules in `run_worker_first` */
export const MAX_ROUTES_RULES = 100;
/** Max char length of each rule in `run_worker_first` */
export const MAX_ROUTES_RULE_LENGTH = 100;
