import crypto from "node:crypto";

export function generateResourceName(type = "worker") {
	return `tmp-e2e-${type}-${crypto.randomUUID()}`;
}
