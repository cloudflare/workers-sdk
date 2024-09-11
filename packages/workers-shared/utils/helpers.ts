import { getType } from "mime";

/** normalises sep for windows, and encodes each segment */
export const encodeFilePath = (filePath: string, sep: string) => {
	const encodedPath = filePath
		.split(sep)
		.map((segment) => encodeURIComponent(segment))
		.join("/");
	return "/" + encodedPath;
};

/** reverses encodeFilePath for accessing from file system */
export const decodeFilePath = (filePath: string, sep: string) => {
	return filePath
		.split("/")
		.map((segment) => decodeURIComponent(segment))
		.join(sep);
};

export const getContentType = (absFilePath: string) => {
	let contentType = getType(absFilePath) || "application/octet-stream";
	if (contentType.startsWith("text/") && !contentType.includes("charset")) {
		contentType = `${contentType}; charset=utf-8`;
	}
	return contentType;
};
