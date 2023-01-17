import sys
import re
from base64 import b64decode
import hashlib

# This regex is written to match against the wasm dynamically loaded by Deno's hash library
regex = r'const (wasmModule.?) = new WebAssembly\.Module\(decode.?\("(.*?)".*?\);'

def repl(m):
    b64_wasm = m.group(2).replace('\n', '').replace('\\', '')
    wasm = b64decode(b64_wasm)
    md5 = hashlib.md5(wasm).hexdigest()

    # Use module md5 to avoid duplication
    fname = f'{md5}.wasm'

    # Write the module to a file
    with open(fname, "wb") as f:
        f.write(wasm)

    replace = f'import {m.group(1)} from \'./{fname}\';'

    return replace

def main(argv):
    if len(argv) != 1:
        print("Specify input file")
        exit(1)

    with open(argv[0]) as f:
        program = f.read()
        print(re.sub(regex, repl, program, flags=re.DOTALL))

if __name__ == "__main__":
    main(sys.argv[1:])
