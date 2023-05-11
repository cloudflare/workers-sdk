import { parseMultipart } from '@ssttevee/multipart-parser';

const RE_MULTIPART = /^multipart\/form-data(?:;\s*boundary=(?:"((?:[^"]|\\")+)"|([^\s;]+)))$/;

const getBoundary = (request: Request): string | undefined => {
	const contentType = request.headers.get('Content-Type');
	if (!contentType) return;

	const matches = RE_MULTIPART.exec(contentType);
	if (!matches) return;

	return matches[1] || matches[2];
};

export const parseFormDataRequest = async (request: Request): Promise<FormData | undefined> => {
	const boundary = getBoundary(request);
	if (!boundary || !request.body) return;

	const parts = await parseMultipart(request.body, boundary);

	const formData = new FormData();

	for (const { name, data, filename, contentType } of parts) {
		formData.append(
			name,
			filename ? new File([data], filename, { type: contentType }) : new TextDecoder().decode(data)
		);
	}

	return formData;
};
