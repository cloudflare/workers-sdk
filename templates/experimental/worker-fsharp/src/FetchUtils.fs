module Fetch.Utils

open Fetch
open Fable.Core

[<Emit("new Response($0, $1)")>]
let newResponse (a:string) (b:ResponseInit) : Response = jsNative