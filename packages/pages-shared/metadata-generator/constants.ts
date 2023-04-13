export const REDIRECTS_VERSION = 1;
export const HEADERS_VERSION = 2;
export const ANALYTICS_VERSION = 1;
export const ROUTES_JSON_VERSION = 1;

export const PERMITTED_STATUS_CODES = new Set([301, 302, 303, 307, 308]);
export const HEADER_SEPARATOR = ":";
export const MAX_LINE_LENGTH = 2000;
export const MAX_HEADER_RULES = 100;
export const MAX_DYNAMIC_REDIRECT_RULES = 100;
export const MAX_STATIC_REDIRECT_RULES = 2000;
export const UNSET_OPERATOR = "! ";

export const SPLAT_REGEX = /\*/g;
export const PLACEHOLDER_REGEX = /:\w+/g;
