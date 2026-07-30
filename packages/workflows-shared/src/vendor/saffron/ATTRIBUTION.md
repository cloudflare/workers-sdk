# Vendored: saffron cron parser (WebAssembly)

`saffron.js` + `saffron_bg.wasm` are a prebuilt WebAssembly artifact that wraps
[cloudflare/saffron](https://github.com/cloudflare/saffron) — the cron parser that
powers Cron Triggers on Cloudflare Workers. It computes cron occurrences for
local-dev Workflows cron scheduling, matching production (which uses the same
parser via the SAFFRON service).

- Upstream: https://github.com/cloudflare/saffron (BSD-3-Clause)
- Pinned to saffron commit `90c2af861010484d17e80542651f0691b00446e7`

## Provenance / rebuild

This is **not** copied from any internal build. It is produced from public source
by the thin wrapper crate in `build/` (which depends on the public `saffron`
crate and exposes only expression parsing + next-occurrence lookup). To rebuild:

```
cd build
wasm-pack build --target web --release
cp pkg/saffron_cron_wasm.js     ../saffron.js
cp pkg/saffron_cron_wasm_bg.wasm ../saffron_bg.wasm
```

`saffron.d.ts` is a hand-written minimal type declaration for the subset of the
glue used by `CronFetcher`. The `.js`/`.wasm` are generated output — regenerate
them via the steps above rather than editing by hand.

## Licenses

`saffron_bg.wasm` statically links the upstream `saffron` crate and its
dependencies, so their notices are reproduced here as required for redistribution
in binary form.

### saffron 0.1.0 — BSD-3-Clause

```
Copyright (c) 2020 Cloudflare, Inc. All rights reserved.

Redistribution and use in source and binary forms, with or without modification, are permitted
provided that the following conditions are met:

1. Redistributions of source code must retain the above copyright notice, this list of conditions
and the following disclaimer.

2. Redistributions in binary form must reproduce the above copyright notice, this list of conditions
and the following disclaimer in the documentation and/or other materials provided with the distribution.

3. Neither the name of the copyright holder nor the names of its contributors may be used to endorse
or promote products derived from this software without specific prior written permission.

THIS SOFTWARE IS PROVIDED BY THE COPYRIGHT HOLDERS AND CONTRIBUTORS "AS IS" AND ANY EXPRESS OR
IMPLIED WARRANTIES, INCLUDING, BUT NOT LIMITED TO, THE IMPLIED WARRANTIES OF MERCHANTABILITY AND
FITNESS FOR A PARTICULAR PURPOSE ARE DISCLAIMED. IN NO EVENT SHALL THE COPYRIGHT HOLDER OR
CONTRIBUTORS BE LIABLE FOR ANY DIRECT, INDIRECT, INCIDENTAL, SPECIAL, EXEMPLARY, OR CONSEQUENTIAL
DAMAGES (INCLUDING, BUT NOT LIMITED TO, PROCUREMENT OF SUBSTITUTE GOODS OR SERVICES; LOSS OF USE,
DATA, OR PROFITS; OR BUSINESS INTERRUPTION) HOWEVER CAUSED AND ON ANY THEORY OF LIABILITY, WHETHER
IN CONTRACT, STRICT LIABILITY, OR TORT (INCLUDING NEGLIGENCE OR OTHERWISE) ARISING IN ANY WAY OUT OF
THE USE OF THIS SOFTWARE, EVEN IF ADVISED OF THE POSSIBILITY OF SUCH DAMAGE.
```

### Bundled dependencies

The wrapper's direct dependencies are compiled into the wasm. Both are
dual-licensed **MIT OR Apache-2.0**; their copyright notices are reproduced below
(full license texts at the linked sources, which also cover these crates' own
permissively licensed transitive dependencies):

- **chrono 0.4.45** — Copyright (c) 2014–2026, Kang Seonghoon and contributors —
  <https://github.com/chronotope/chrono/blob/main/LICENSE.txt>
- **wasm-bindgen 0.2.126** — Copyright (c) 2014 Alex Crichton —
  <https://github.com/rustwasm/wasm-bindgen/blob/main/LICENSE-MIT>
