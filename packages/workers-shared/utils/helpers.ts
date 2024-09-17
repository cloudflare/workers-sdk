import { getType } from "mime";

/** normalises sep for windows */
export const normalizeFilePath = (filePath: string, sep: string) => {
	const encodedPath = filePath.split(sep).join("/");
	return "/" + encodedPath;
};

export const getContentType = (absFilePath: string) => {
	let contentType = getType(absFilePath) || "application/octet-stream";
	if (contentType.startsWith("text/") && !contentType.includes("charset")) {
		contentType = `${contentType}; charset=utf-8`;
	}
	return contentType;
};
