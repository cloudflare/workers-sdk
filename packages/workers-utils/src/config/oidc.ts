/** Validate an exact StringOrURI audience without fetching or normalizing it. */
export function validOidcAudience(value: unknown): value is string {
	if (
		typeof value !== "string" ||
		value.length === 0 ||
		value.length > 2048 ||
		!value.isWellFormed() ||
		/^[\s\u0085]*$/.test(value) ||
		new TextEncoder().encode(value).length > 2048
	) {
		return false;
	}
	const colon = value.indexOf(":");
	if (colon < 0) {
		return true;
	}
	if (/[^\x21-\x7e]/.test(value)) {
		return false;
	}
	if (!/^[A-Za-z][A-Za-z0-9+.-]*$/.test(value.slice(0, colon))) {
		return false;
	}
	// RFC 3986 components match the EWC and native signer grammar. WHATWG URL
	// parsing repairs invalid spellings and rejects valid URIs such as IPvFuture.
	let rest = value.slice(colon + 1);
	const hash = rest.indexOf("#");
	if (hash >= 0) {
		if (!uriComponent(rest.slice(hash + 1), ":@/?")) {
			return false;
		}
		rest = rest.slice(0, hash);
	}
	const question = rest.indexOf("?");
	if (question >= 0) {
		if (!uriComponent(rest.slice(question + 1), ":@/?")) {
			return false;
		}
		rest = rest.slice(0, question);
	}
	if (rest.startsWith("//")) {
		rest = rest.slice(2);
		const slash = rest.indexOf("/");
		const end = slash < 0 ? rest.length : slash;
		if (!uriAuthority(rest.slice(0, end))) {
			return false;
		}
		rest = rest.slice(end);
	}
	return uriComponent(rest, ":@/");
}

function uriComponent(value: string, extra: string): boolean {
	for (let i = 0; i < value.length; i++) {
		const c = value[i];
		if (c === "%") {
			if (!/^[A-Fa-f0-9]{2}$/.test(value.slice(i + 1, i + 3))) {
				return false;
			}
			i += 2;
		} else if (
			!/[A-Za-z0-9]/.test(c) &&
			!"-._~!$&'()*+,;=".includes(c) &&
			!extra.includes(c)
		) {
			return false;
		}
	}
	return true;
}

function uriAuthority(value: string): boolean {
	const at = value.indexOf("@");
	if (at >= 0) {
		if (!uriComponent(value.slice(0, at), ":")) {
			return false;
		}
		value = value.slice(at + 1);
	}
	if (value.startsWith("[")) {
		const end = value.indexOf("]");
		if (end < 0 || !ipLiteral(value.slice(1, end))) {
			return false;
		}
		value = value.slice(end + 1);
		if (value === "") {
			return true;
		}
		if (!value.startsWith(":")) {
			return false;
		}
	} else {
		const colon = value.indexOf(":");
		if (colon < 0) {
			return uriComponent(value, "");
		}
		if (!uriComponent(value.slice(0, colon), "")) {
			return false;
		}
		value = value.slice(colon);
	}
	return !/[^0-9]/.test(value.slice(1));
}

function ipLiteral(value: string): boolean {
	if (/^[vV]/.test(value)) {
		const dot = value.indexOf(".");
		return (
			dot > 1 &&
			dot + 1 < value.length &&
			/^[A-Fa-f0-9]+$/.test(value.slice(1, dot)) &&
			!value.includes("%") &&
			uriComponent(value.slice(dot + 1), ":")
		);
	}
	let groups = 0;
	let compressed = value.startsWith("::");
	if (compressed) {
		value = value.slice(2);
	}
	while (value.length > 0) {
		const colon = value.indexOf(":");
		const end = colon < 0 ? value.length : colon;
		const group = value.slice(0, end);
		if (group.includes(".")) {
			const octets = group.split(".");
			return (
				end === value.length &&
				(compressed ? groups < 6 : groups === 6) &&
				octets.length === 4 &&
				octets.every(
					(octet) => /^(0|[1-9][0-9]{0,2})$/.test(octet) && Number(octet) <= 255
				)
			);
		}
		if (!/^[A-Fa-f0-9]{1,4}$/.test(group) || ++groups > 8) {
			return false;
		}
		if (end === value.length) {
			break;
		}
		value = value.slice(end + 1);
		if (value.startsWith(":")) {
			if (compressed) {
				return false;
			}
			compressed = true;
			value = value.slice(1);
		} else if (value === "") {
			return false;
		}
	}
	return compressed ? groups < 8 : groups === 8;
}

/** Validate a binding request. The API independently resolves its approved assignment. */
export function isOidcBinding(value: unknown): boolean {
	if (!value || typeof value !== "object" || Array.isArray(value)) {
		return false;
	}
	const v = value as Record<string, unknown>;
	if (
		Reflect.ownKeys(v).some(
			(k) =>
				!["binding", "identity_id", "audience", "allowed_audiences"].includes(
					String(k)
				)
		)
	) {
		return false;
	}
	if (
		![v.binding, v.identity_id].every(
			(x) =>
				typeof x === "string" &&
				x.length > 0 &&
				x.length <= 128 &&
				!/[^A-Za-z0-9_-]/.test(x)
		)
	) {
		return false;
	}
	if (!validOidcAudience(v.audience)) {
		return false;
	}
	const a = v.allowed_audiences;
	return (
		a === undefined ||
		(Array.isArray(a) &&
			a.length > 0 &&
			a.length <= 64 &&
			a.every(validOidcAudience) &&
			new Set(a).size === a.length &&
			a.includes(v.audience))
	);
}
