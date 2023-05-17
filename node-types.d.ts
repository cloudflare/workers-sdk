// https://github.com/cloudflare/workers-sdk/pull/2496#discussion_r1062516883

import { WebAssembly as WorkerWebAssembly } from "@cloudflare/workers-types";
import type {
	EventTargetAddEventListenerOptions,
	EventTargetEventListenerOptions,
} from "@cloudflare/workers-types";

declare global {
	type EventListenerOptions = EventTargetEventListenerOptions;
	type AddEventListenerOptions = EventTargetAddEventListenerOptions;
	// (can't use EventTarget from "@cloudflare/workers-types" as it's event map
	// type parameters are incompatible with `tinybench`, a `vitest` dependency)

	// `WebAssembly` has been global since Node 8, but isn't included in
	// `@types/node`.
	type BufferSource = ArrayBufferView | ArrayBuffer;
	namespace WebAssembly {
		class CompileError extends WorkerWebAssembly.CompileError {}
		class RuntimeError extends WorkerWebAssembly.RuntimeError {}

		type ValueType = WorkerWebAssembly.ValueType;
		type GlobalDescriptor = WorkerWebAssembly.GlobalDescriptor;
		class Global extends WorkerWebAssembly.Global {}

		type ImportValue = WorkerWebAssembly.ImportValue;
		type ModuleImports = WorkerWebAssembly.ModuleImports;
		type Imports = WorkerWebAssembly.Imports;

		type ExportValue = WorkerWebAssembly.ExportValue;
		type Exports = WorkerWebAssembly.Exports;

		class Instance extends WorkerWebAssembly.Instance {}

		type MemoryDescriptor = WorkerWebAssembly.MemoryDescriptor;
		class Memory extends WorkerWebAssembly.Memory {}

		type ImportExportKind = WorkerWebAssembly.ImportExportKind;
		type ModuleExportDescriptor = WorkerWebAssembly.ModuleExportDescriptor;
		type ModuleImportDescriptor = WorkerWebAssembly.ModuleImportDescriptor;
		class Module extends WorkerWebAssembly.Module {
			// Node.js allows dynamic compilation of WebAssembly unlike Workers
			constructor(bytes: BufferSource);
		}

		type TableKind = WorkerWebAssembly.TableKind;
		type TableDescriptor = WorkerWebAssembly.TableDescriptor;
		class Table extends WorkerWebAssembly.Table {}

		// Node.js allows dynamic compilation of WebAssembly unlike Workers
		interface WebAssemblyInstantiatedSource {
			instance: Instance;
			module: Module;
		}
		function compile(bytes: BufferSource): Promise<Module>;
		function instantiate(
			bytes: BufferSource,
			importObject?: Imports
		): Promise<WebAssemblyInstantiatedSource>;
		function instantiate(
			moduleObject: Module,
			importObject?: Imports
		): Promise<Instance>;
		function validate(bytes: BufferSource): boolean;
	}

	// `Worker` isn't defined on the global scope in Node.js, but it's required
	// by `vite`. Therefore, define it as an empty interface.
	// eslint-disable-next-line @typescript-eslint/no-empty-interface
	interface Worker {}

	// `MessagePort` has been global since Node 15, but isn't included in
	// `@types/node`. This is required by `undici`'s types.
	// eslint-disable-next-line no-var,@typescript-eslint/consistent-type-imports
	var MessagePort: typeof import("worker_threads").MessagePort;
}
