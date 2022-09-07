import { add } from "./my-wasm-module-add.wasm";
import { multiply } from "./my-wasm-module-multiply.wasm"

console.log(add(1, 2));
console.log(multiply(2, 3));