import * as index_bg from "./index_bg.js";
import _wasm from "../index_bg.wasm";

const _wasm_memory = new WebAssembly.Memory({ initial: 512 });
let importsObject = {
  env: { memory: _wasm_memory },
  "./index_bg.js": index_bg,
};

export default new WebAssembly.Instance(_wasm, importsObject).exports;
