(module
  (func $multiply (param $p1 i32) (param $p2 i32) (result i32)
    local.get $p1
    local.get $p2
    i32.mul)
  (export "multiply" (func $multiply))
)
