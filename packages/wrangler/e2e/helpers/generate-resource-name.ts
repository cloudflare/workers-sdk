import crypto from "node:crypto";

export function generateResourceName(type = "worker", maxLength?: number) {
	return `tmp-e2e-${type}-${crypto.randomUUID().slice(0, maxLength)}`;
}
