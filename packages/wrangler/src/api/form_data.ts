import type {
  CfWorkerInit,
  CfModuleType,
  CfVariable,
  CfModule,
  CfKvNamespace,
  CfCryptoKey,
} from "./worker.js";
import { FormData, Blob } from "formdata-node";

// Credit: https://stackoverflow.com/a/9458996
function toBase64(source: BufferSource): string {
  let result = "";
  const buffer = source instanceof ArrayBuffer ? source : source.buffer;
  const bytes = new Uint8Array(buffer);
  for (let i = 0; i < bytes.byteLength; i++) {
    result += String.fromCharCode(bytes[i]);
  }
  return btoa(result);
}

function toBinding(
  name: string,
  variable: CfVariable
): Record<string, unknown> {
  if (typeof variable === "string") {
    return { name, type: "plain_text", text: variable };
  }

  const { namespaceId } = variable as CfKvNamespace;
  if (namespaceId) {
    return { name, type: "kv_namespace", namespace_id: namespaceId };
  }

  const { format, algorithm, usages, data } = variable as CfCryptoKey;
  if (format) {
    let key_base64;
    let key_jwk;
    if (data instanceof ArrayBuffer || ArrayBuffer.isView(data)) {
      key_base64 = toBase64(data);
    } else {
      key_jwk = data;
    }
    return {
      name,
      type: "secret_key",
      format,
      algorithm,
      usages,
      key_base64,
      key_jwk,
    };
  }

  throw new TypeError("Unsupported variable: " + variable);
}

export function toMimeType(type: CfModuleType): string {
  switch (type) {
    case "esm":
      return "application/javascript+module";
    case "commonjs":
      return "application/javascript";
    case "compiled-wasm":
      return "application/wasm";
    case "buffer":
      return "application/octet-stream";
    case "text":
      return "text/plain";
    default:
      throw new TypeError("Unsupported module: " + type);
  }
}

function toModule(module: CfModule, entryType?: CfModuleType): Blob {
  const { type: moduleType, content } = module;
  const type = toMimeType(moduleType ?? entryType);

  return new Blob([content], { type });
}

/**
 * Creates a `FormData` upload from a `CfWorkerInit`.
 */
export function toFormData(worker: CfWorkerInit): FormData {
  const formData = new FormData();
  const { main, modules, variables, usage_model, compatibility_date } = worker;
  const { name, type: mainType } = main;

  const bindings = [];
  for (const [name, variable] of Object.entries(variables ?? {})) {
    const binding = toBinding(name, variable);
    bindings.push(binding);
  }

  const singleton = mainType === "commonjs";
  const metadata = {
    main_module: singleton ? undefined : name,
    body_part: singleton ? name : undefined,
    bindings,
  };
  if (compatibility_date) {
    // @ts-expect-error - we should type metadata
    metadata.compatibility_date = compatibility_date;
  }
  if (usage_model) {
    // @ts-expect-error - we should type metadata
    metadata.usage_model = usage_model;
  }
  formData.set("metadata", JSON.stringify(metadata));

  if (singleton && modules && modules.length > 0) {
    throw new TypeError(
      "More than one module can only be specified when type = 'esm'"
    );
  }

  for (const module of [main].concat(modules || [])) {
    const { name } = module;
    const blob = toModule(module, mainType ?? "esm");
    formData.set(name, blob, name);
  }

  return formData;
}
