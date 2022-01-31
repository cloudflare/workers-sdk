import { FormData, File } from "undici";
import type {
  CfWorkerInit,
  CfModuleType,
  CfModule,
  CfDurableObjectMigrations,
} from "./worker.js";

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

function toModule(module: CfModule, entryType: CfModuleType): File {
  const { type: moduleType, content } = module;
  const type = toMimeType(moduleType ?? entryType);
  return new File([content], module.name, { type });
}

export interface WorkerMetadata {
  /** The name of the entry point module. Only exists when the worker is in the ES module format */
  main_module?: string;
  /** The name of the entry point module. Only exists when the worker is in the Service Worker format */
  body_part?: string;
  compatibility_date?: string;
  compatibility_flags?: string[];
  usage_model?: "bundled" | "unbound";
  migrations?: CfDurableObjectMigrations;
  bindings: (
    | { type: "kv_namespace"; name: string; namespace_id: string }
    | { type: "plain_text"; name: string; text: string }
    | {
        type: "durable_object_namespace";
        name: string;
        class_name: string;
        script_name?: string;
      }
    | {
        type: "service";
        name: string;
        service: string;
        environment: string;
      }
  )[];
}

/**
 * Creates a `FormData` upload from a `CfWorkerInit`.
 */
export function toFormData(worker: CfWorkerInit): FormData {
  const formData = new FormData();
  const {
    main,
    modules,
    bindings,
    migrations,
    usage_model,
    compatibility_date,
    compatibility_flags,
  } = worker;

  const metadataBindings: WorkerMetadata["bindings"] = [];

  bindings.kv_namespaces?.forEach(({ id, binding }) => {
    metadataBindings.push({
      name: binding,
      type: "kv_namespace",
      namespace_id: id,
    });
  });

  bindings.durable_objects?.bindings.forEach(
    ({ name, class_name, script_name }) => {
      metadataBindings.push({
        name,
        type: "durable_object_namespace",
        class_name: class_name,
        ...(script_name && { script_name }),
      });
    }
  );

  Object.entries(bindings.vars || {})?.forEach(([key, value]) => {
    metadataBindings.push({ name: key, type: "plain_text", text: value });
  });

  bindings.services?.forEach(({ name, service, environment }) => {
    metadataBindings.push({
      name,
      type: "service",
      service,
      environment,
    });
  });

  const metadata: WorkerMetadata = {
    ...(main.type !== "commonjs"
      ? { main_module: main.name }
      : { body_part: main.name }),
    bindings: metadataBindings,
    ...(compatibility_date && { compatibility_date }),
    ...(compatibility_flags && { compatibility_flags }),
    ...(usage_model && { usage_model }),
    ...(migrations && { migrations }),
  };

  formData.set("metadata", JSON.stringify(metadata));

  if (main.type === "commonjs" && modules && modules.length > 0) {
    throw new TypeError(
      "More than one module can only be specified when type = 'esm'"
    );
  }

  for (const module of [main].concat(modules || [])) {
    const { name } = module;
    const file = toModule(module, main.type ?? "esm");
    formData.set(name, file);
  }

  return formData;
}
