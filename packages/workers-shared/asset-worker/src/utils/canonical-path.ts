declare const routingPathBrand: unique symbol;
declare const assetPathBrand: unique symbol;

// Replaces raw URL pathname handling for routing and rule matching after rollout.
export type CanonicalRoutingPath = string & {
	readonly [routingPathBrand]: "CanonicalRoutingPath";
};

// Reserved for asset lookup after decoding exactly once.
export type DecodedAssetPath = string & {
	readonly [assetPathBrand]: "DecodedAssetPath";
};

// Bitmask of transformations observed while canonicalizing a request path.
export const enum PathNormalization {
	None = 0,
	Decoded = 1 << 0,
	CollapsedSlashes = 1 << 1,
	MalformedEncoding = 1 << 2,
	Reencoded = 1 << 3,
}

export type CanonicalPath = {
	routingPath: CanonicalRoutingPath;
	assetPath: DecodedAssetPath;
	normalization: PathNormalization;
};

// Returns both path representations so routing cannot accidentally reuse lookup input.
export function canonicalizePath(pathname: string): CanonicalPath {
	let decodedPathname = pathname;
	let normalization = PathNormalization.None;

	try {
		decodedPathname = decodeURIComponent(pathname);
		if (decodedPathname !== pathname) {
			normalization |= PathNormalization.Decoded;
		}
	} catch {
		normalization |= PathNormalization.MalformedEncoding;
	}

	const collapsedPathname = decodedPathname.replace(/\/{2,}/g, "/");
	if (collapsedPathname !== decodedPathname) {
		normalization |= PathNormalization.CollapsedSlashes;
	}

	const routingPath = encodePath(collapsedPathname);
	if (routingPath !== collapsedPathname) {
		normalization |= PathNormalization.Reencoded;
	}

	return {
		routingPath: routingPath as CanonicalRoutingPath,
		assetPath: collapsedPathname as DecodedAssetPath,
		normalization,
	};
}

function encodePath(pathname: string): string {
	return pathname
		.split("/")
		.map((segment) => {
			try {
				return encodeURIComponent(segment);
			} catch {
				return segment;
			}
		})
		.join("/");
}
