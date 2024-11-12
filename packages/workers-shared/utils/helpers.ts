import { isAbsolute, sep } from "node:path";
import { getType } from "mime";

/** normalises sep for windows and prefix with `/` */
export const normalizeFilePath = (relativeFilepath: string) => {
	if (isAbsolute(relativeFilepath)) {
		throw new Error(`Expected relative path`);
	}
	return "/" + relativeFilepath.split(sep).join("/");
};

export const getContentType = (absFilePath: string) => {
	let contentType = getType(absFilePath) || "application/octet-stream";
	if (contentType.startsWith("text/") && !contentType.includes("charset")) {
		contentType = `${contentType}; charset=utf-8`;
	}
	return contentType;
};
