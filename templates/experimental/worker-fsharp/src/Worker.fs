module Worker

open System

open Fable.Core
open Fable.Core.JS
open Fable.Core.JsInterop

open Fetch
open Fetch.Utils
open Fable.Cloudflare.Workers


//The worker code is here. Define a request handler which creates an an
// appropriate Response and returns a Promise<Response>
let private handleRequest (req:Request) =
    promise {
        // YOUR CODE HERE
        let txt =
            sprintf "Hello from Fable at: %s %s"
                (DateTime.Now.ToLongDateString())
                (DateTime.Now.ToLongTimeString())
        let status : ResponseInit = !! {| status = "200" |}
        let response = newResponse txt status
        return response }


// Register a listener for the ServiceWorker 'fetch' event. That listener
// will extract the request and dispatch it to the request handler.
addEventListener_fetch (fun (e:FetchEvent) ->
    e.respondWith (!^ (handleRequest e.request)))
