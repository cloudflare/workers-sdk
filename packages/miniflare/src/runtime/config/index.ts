import { Data, List, Message, Struct } from "capnp-ts";
import { Config } from "./sserve-conf";
import { Config as CapnpConfig } from "./sserve-conf.capnp.js";

function capitalize<S extends string>(str: S): Capitalize<S> {
	return (
		str.length > 0 ? str[0].toUpperCase() + str.substring(1) : str
	) as Capitalize<S>;
}

// TODO(important): this will fail if someone sets `{ script: undefined }` or
//  something manually, where we're expecting an optional string, need a better
//  solution
function encodeCapnpStruct(obj: any, struct: Struct, padding = "") {
	const anyStruct = struct as any;
	for (const [key, value] of Object.entries(obj)) {
		const capitalized = capitalize(key);
		if (value instanceof Uint8Array) {
			const newData: Data = anyStruct[`init${capitalized}`](value.byteLength);
			newData.copyBuffer(value);
		} else if (Array.isArray(value)) {
			const newList: List<any> = anyStruct[`init${capitalized}`](value.length);
			for (let i = 0; i < value.length; i++) {
				if (typeof value[i] === "object") {
					encodeCapnpStruct(value[i], newList.get(i), padding + "  ");
				} else {
					newList.set(i, value[i]);
				}
			}
		} else if (typeof value === "object") {
			const newStruct: Struct = anyStruct[`init${capitalized}`]();
			encodeCapnpStruct(value, newStruct, padding + "  ");
		} else {
			// TODO: could we catch here if value is actually undefined, but meant to
			//  be a different type
			anyStruct[`set${capitalized}`](value);
		}
	}
}

export function serializeConfig(config: Config): Buffer {
	const message = new Message();
	const struct = message.initRoot(CapnpConfig);
	encodeCapnpStruct(config, struct);
	return Buffer.from(message.toArrayBuffer());
}

export * from "./sserve-conf";
