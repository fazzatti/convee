(component
  (core module $constant
    (func (export "constant") (result i32) i32.const 17))
  (core module $consumer
    (import "constant" "constant" (func $constant (result i32)))
    (memory (export "memory") 1)
    ;; Return areas: malformed UTF-8 at 16, and a two-byte list straddling the
    ;; memory boundary. These deliberately violate the canonical ABI contract.
    (data (i32.const 0) "\10\00\00\00\02\00\00\00\ff\ff\00\00\02\00\00\00\c3\28")
    (func (export "add") (param i32) (result i32)
      call $constant local.get 0 i32.add)
    (func (export "bad-char") (result i32) i32.const 1114112)
    (func (export "bad-utf8") (result i32) i32.const 0)
    (func (export "bad-string-pointer") (result i32) i32.const 65536)
    (func (export "out-of-bounds-list") (result i32) i32.const 8))
  (core instance $first (instantiate $constant))
  (core instance $second
    (instantiate $consumer (with "constant" (instance $first))))
  (func (export "add") (param "value" u32) (result u32)
    (canon lift (core func $second "add")))
  (func (export "bad-char") (result char)
    (canon lift (core func $second "bad-char")))
  (func (export "bad-utf8") (result string)
    (canon lift (core func $second "bad-utf8") (memory (core memory $second "memory"))))
  (func (export "bad-string-pointer") (result string)
    (canon lift (core func $second "bad-string-pointer") (memory (core memory $second "memory"))))
  (func (export "out-of-bounds-list") (result (list u8))
    (canon lift (core func $second "out-of-bounds-list") (memory (core memory $second "memory")))))
