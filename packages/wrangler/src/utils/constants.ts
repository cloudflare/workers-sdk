export const resetColor = "\x1b[0m";
export const fgGreenColor = "\x1b[32m";
export const betaCmdColor = "#BD5B08";

export const DEFAULT_LOCAL_PORT = 8787;
export const DEFAULT_INSPECTOR_PORT = 9229;
export const proxy =
	process.env.https_proxy ||
	process.env.HTTPS_PROXY ||
	process.env.http_proxy ||
	process.env.HTTP_PROXY ||
	undefined;
