export const compressedByCloudflareFL = new Set([
	// list copied from https://developers.cloudflare.com/speed/optimization/content/brotli/content-compression/#:~:text=If%20supported%20by%20visitors%E2%80%99%20web%20browsers%2C%20Cloudflare%20will%20return%20Gzip%20or%20Brotli%2Dencoded%20responses%20for%20the%20following%20content%20types%3A
	"text/html",
	"text/richtext",
	"text/plain",
	"text/css",
	"text/x-script",
	"text/x-component",
	"text/x-java-source",
	"text/x-markdown",
	"application/javascript",
	"application/x-javascript",
	"text/javascript",
	"text/js",
	"image/x-icon",
	"image/vnd.microsoft.icon",
	"application/x-perl",
	"application/x-httpd-cgi",
	"text/xml",
	"application/xml",
	"application/rss+xml",
	"application/vnd.api+json",
	"application/x-protobuf",
	"application/json",
	"multipart/bag",
	"multipart/mixed",
	"application/xhtml+xml",
	"font/ttf",
	"font/otf",
	"font/x-woff",
	"image/svg+xml",
	"application/vnd.ms-fontobject",
	"application/ttf",
	"application/x-ttf",
	"application/otf",
	"application/x-otf",
	"application/truetype",
	"application/opentype",
	"application/x-opentype",
	"application/font-woff",
	"application/eot",
	"application/font",
	"application/font-sfnt",
	"application/wasm",
	"application/javascript-binast",
	"application/manifest+json",
	"application/ld+json",
	"application/graphql+json",
	"application/geo+json",
]);

export function isCompressedByCloudflareFL(
	contentTypeHeader: string | undefined | null
) {
	if (!contentTypeHeader) return true; // Content-Type inferred as text/plain

	const [contentType] = contentTypeHeader.split(";");

	return compressedByCloudflareFL.has(contentType);
}
