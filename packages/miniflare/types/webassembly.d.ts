/* eslint-disable @typescript-eslint/no-unsafe-function-type */
// Types adapted from https://github.com/microsoft/TypeScript/blob/main/lib/lib.webworker.d.ts
//
// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the Apache License, Version 2.0 (the "License"); you may not use
// this file except in compliance with the License. You may obtain a copy of the
// License at http://www.apache.org/licenses/LICENSE-2.0
//
// THIS CODE IS PROVIDED ON AN *AS IS* BASIS, WITHOUT WARRANTIES OR CONDITIONS OF ANY
// KIND, EITHER EXPRESS OR IMPLIED, INCLUDING WITHOUT LIMITATION ANY IMPLIED
// WARRANTIES OR CONDITIONS OF TITLE, FITNESS FOR A PARTICULAR PURPOSE,
// MERCHANTABLITY OR NON-INFRINGEMENT.
//
// See the Apache Version 2.0 License for specific language governing permissions
// and limitations under the License.

type BufferSource = ArrayBufferView | ArrayBuffer;
declare namespace WebAssembly {
	class Global {
		constructor(descriptor: GlobalDescriptor, v?: any);
		value: any;
		valueOf(): any;
	}

	class Instance {
		constructor(module: Module, importObject?: Imports);
		readonly exports: Exports;
	}

	class Memory {
		constructor(descriptor: MemoryDescriptor);
		readonly buffer: ArrayBuffer;
		grow(delta: number): number;
	}

	class Module {
		constructor(bytes: BufferSource);
		static customSections(
			moduleObject: Module,
			sectionName: string
		): ArrayBuffer[];
		static exports(moduleObject: Module): ModuleExportDescriptor[];
		static imports(moduleObject: Module): ModuleImportDescriptor[];
	}

	class Table {
		constructor(descriptor: TableDescriptor);
		readonly length: number;
		get(index: number): Function | null;
		grow(delta: number): number;
		set(index: number, value: Function | null): void;
	}

	interface GlobalDescriptor {
		mutable?: boolean;
		value: ValueType;
	}

	interface MemoryDescriptor {
		initial: number;
		maximum?: number;
		shared?: boolean;
	}

	interface ModuleExportDescriptor {
		kind: ImportExportKind;
		name: string;
	}

	interface ModuleImportDescriptor {
		kind: ImportExportKind;
		module: string;
		name: string;
	}

	interface TableDescriptor {
		element: TableKind;
		initial: number;
		maximum?: number;
	}

	interface WebAssemblyInstantiatedSource {
		instance: Instance;
		module: Module;
	}

	type ImportExportKind = "function" | "global" | "memory" | "table";
	type TableKind = "anyfunc";
	type ValueType = "f32" | "f64" | "i32" | "i64";
	type ExportValue = Function | Global | Memory | Table;
	type Exports = Record<string, ExportValue>;
	type ImportValue = ExportValue | number;
	type ModuleImports = Record<string, ImportValue>;
	type Imports = Record<string, ModuleImports>;

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
