// Generated with ts2fable 0.8.0 from https://github.com/Krzysztof-Cieslak/workers-types/blob/fable/index.d.ts
module rec Fable.Cloudflare.Workers

open Fable.Core
open Fable.Core.JS
open Fetch
open Node.Stream

type Array<'T> = System.Collections.Generic.IList<'T>

type [<AllowNullLiteral>] IExports =
    abstract HTMLRewriter: HTMLRewriterStatic

type [<AllowNullLiteral>] FetchEvent =
    /// The type of event.
    abstract ``type``: string with get, set
    /// The incoming HTTP request triggering `FetchEvent`.
    abstract request: CfRequest with get, set
    /// Extend the lifetime of the event without blocking the response
    /// from being sent. Use this method to notify the runtime to wait
    /// for tasks (e.g. logging, analytics to third-party services,
    /// streaming and caching) that need to run longer than the usual
    /// time it takes to send a response.
    abstract waitUntil: promise: Promise<obj option> -> unit
    /// Prevents requests from failing due to an unhandled exception thrown
    /// by the Worker, causing it instead to “fail open”Open external link.
    /// Instead of returning an error response, the runtime will proxy the
    /// request to the origin server as though the Worker was never invoked.
    abstract passThroughOnException: (unit -> unit) with get, set
    /// Intercept the request and send a custom response. If no event handler calls
    /// `respondWith()` the runtime attempts to request the origin as if no Worker
    /// script exists. If no origin is setup (e.g. workers.dev sites), then the Workers
    /// script must call `respondWith()` for a valid response.
    abstract respondWith: response: U2<Promise<Response>, Response> -> unit

type [<AllowNullLiteral>] ScheduledEvent =
    /// The type of event. This will always return `"scheduled"`.
    abstract ``type``: string with get, set
    /// The time the `ScheduledEvent` was scheduled to be executed in
    /// milliseconds since January 1, 1970, UTC.
    /// It can be parsed as `new Date(event.scheduledTime)`
    abstract scheduledTime: float with get, set
    /// Use this method to notify the runtime to wait for asynchronous tasks
    /// (e.g. logging, analytics to third-party services, streaming and caching).
    /// The first `event.waitUntil` to fail will be observed and recorded as the
    /// status in the Cron Trigger Past Events table. Otherwise, it will be
    /// reported as a Success.
    abstract waitUntil: promise: Promise<obj option> -> unit

type [<AllowNullLiteral>] RequestInitCfProperties =
    /// In addition to the properties you can set in the RequestInit dict
    /// that you pass as an argument to the Request constructor, you can
    /// set certain properties of a `cf` object to control how Cloudflare
    /// features are applied to that new Request.
    ///
    /// Note: Currently, these properties cannot be tested in the
    /// playground.
    abstract cacheEverything: bool option with get, set
    /// A request's cache key is what determines if two requests are
    /// "the same" for caching purposes. If a request has the same cache key
    /// as some previous request, then we can serve the same cached response for
    /// both. (e.g. 'some-key')
    ///
    /// Only available for Enterprise customers.
    abstract cacheKey: string option with get, set
    /// Force response to be cached for a given number of seconds. (e.g. 300)
    abstract cacheTtl: float option with get, set
    /// Force response to be cached for a given number of seconds based on the Origin status code.
    /// (e.g. { '200-299': 86400, '404': 1, '500-599': 0 })
    abstract cacheTtlByStatus: RequestInitCfPropertiesCacheTtlByStatus option with get, set
    abstract scrapeShield: bool option with get, set
    abstract apps: bool option with get, set
    abstract minify: RequestInitCfPropertiesMinify option with get, set
    abstract mirage: bool option with get, set
    /// Redirects the request to an alternate origin server. You can use this,
    /// for example, to implement load balancing across several origins.
    /// (e.g.us-east.example.com)
    ///
    /// Note - For security reasons, the hostname set in resolveOverride must
    /// be proxied on the same Cloudflare zone of the incoming request.
    /// Otherwise, the setting is ignored. CNAME hosts are allowed, so to
    /// resolve to a host under a different domain or a DNS only domain first
    /// declare a CNAME record within your own zone’s DNS mapping to the
    /// external hostname, set proxy on Cloudflare, then set resolveOverride
    /// to point to that CNAME record.
    abstract resolveOverride: string option with get, set

type [<AllowNullLiteral>] IncomingRequestCfProperties =
    /// (e.g. 395747)
    abstract asn: float with get, set
    abstract botManagement: IncomingRequestCfPropertiesBotManagement option with get, set
    abstract city: string option with get, set
    abstract clientTcpRtt: float with get, set
    abstract clientTrustScore: float option with get, set
    /// The three-letter airport code of the data center that the request
    /// hit. (e.g. "DFW")
    abstract colo: string with get, set
    abstract continent: string option with get, set
    /// The two-letter country code in the request. This is the same value
    /// as that provided in the CF-IPCountry header. (e.g. "US")
    abstract country: string with get, set
    abstract httpProtocol: string with get, set
    abstract latitude: float option with get, set
    abstract longitude: float option with get, set
    /// DMA metro code from which the request was issued, e.g. "635"
    abstract metroCode: float option with get, set
    abstract postalCode: string option with get, set
    /// e.g. "Texas"
    abstract region: string option with get, set
    /// e.g. "TX"
    abstract regionCode: string option with get, set
    /// e.g. "weight=256;exclusive=1"
    abstract requestPriority: string with get, set
    /// e.g. "America/Chicago"
    abstract timezone: string option with get, set
    abstract tlsVersion: string with get, set
    abstract tlsCipher: string with get, set
    abstract tlsClientAuth: IncomingRequestCfPropertiesTlsClientAuth with get, set

type CfRequestInit =
    inherit RequestInit
    /// cf is a union of these two types because there are multiple
    /// scenarios in which it might be one or the other. If you need
    /// a type that only contains RequestInitCfProperties, use the
    /// CfRequestInit type.
    ///
    /// IncomingRequestCfProperties is required to allow
    ///    new Request(someUrl, event.request)
    ///
    /// RequestInitCfProperties is required to allow
    ///    new Request(event.request, {cf: { ... } })
    ///    fetch(someUrl, {cf: { ... } })
    abstract cf: U2<IncomingRequestCfProperties, RequestInitCfProperties> option with get, set

type CfRequest =
    inherit Request
    abstract cf: IncomingRequestCfProperties with get, set

type [<AllowNullLiteral>] ContentOptions =
    /// Controls the way the HTMLRewriter treats inserted content.
    ///
    /// - true: Raw HTML
    /// - false: (Default) Text and any HTML will be escaped
    abstract html: bool with get, set

type [<AllowNullLiteral>] Element =
    /// The namespace URI of the element according to Infra Spec
    /// (https://infra.spec.whatwg.org/#namespaces).
    abstract namespaceURI: string with get, set
    /// e.g. "div"
    abstract tagName: string with get, set
    /// Read-Only - key/value pairs of attributes.
    abstract attributes: obj // TODO: IterableIterator<string * string>
    /// Indicates whether the element was removed/replaced in a previous handler
    abstract removed: bool with get, set
    /// Returns the value for a given attribute name on the element, or null if it isn’t found.
    abstract getAttribute: name: string -> string option
    /// Returns a boolean indicating whether an attribute exists on the element.
    abstract hasAttribute: name: string -> bool
    /// Sets an attribute to a provided value, creating the attribute if it doesn’t exist.
    abstract setAttribute: name: string * value: string -> Element
    /// Removes the attribute.
    abstract removeAttribute: name: string -> Element
    /// Inserts content before the element.
    abstract before: content: string * ?options: ContentOptions -> Element
    /// Inserts content right after the element.
    abstract after: content: string * ?options: ContentOptions -> Element
    /// Inserts content right after the start tag of the element.
    abstract prepend: content: string * ?options: ContentOptions -> Element
    /// Inserts content right before the end tag of the element.
    abstract append: content: string * ?options: ContentOptions -> Element
    /// Removes the element and inserts content in place of it.
    abstract replace: content: string * ?options: ContentOptions -> Element
    /// Replaces content of the element.
    abstract setInnerContent: content: string * ?options: ContentOptions -> Element
    /// Removes the element with all its content.
    abstract remove: unit -> Element
    /// Removes the start tag and end tag of the element, but keeps its inner content intact.
    abstract removeAndKeepContent: unit -> Element

type [<AllowNullLiteral>] Text =
    /// Indicates whether the element was removed/replaced in a previous handler.
    abstract removed: bool with get, set
    /// Read-Only - The text contents of the chunk. Could be empty if the chunk
    /// is the last chunk of the text node.
    abstract text: string
    /// Read-Only - indicates whether the chunk is the last chunk of the text node.
    abstract lastInTextNode: bool
    /// Inserts content before the element.
    abstract before: content: string * ?options: ContentOptions -> Element
    /// Inserts content right after the element.
    abstract after: content: string * ?options: ContentOptions -> Element
    /// Removes the element and inserts content in place of it.
    abstract replace: content: string * ?options: ContentOptions -> Element
    /// Removes the element with all its content.
    abstract remove: unit -> Element

type [<AllowNullLiteral>] Comment =
    /// Indicates whether the element was removed/replaced in a previous handler.
    abstract removed: bool with get, set
    /// This property can be assigned different values, to modify comment’s text.
    abstract text: string with get, set
    /// Inserts content before the element.
    abstract before: content: string * ?options: ContentOptions -> Element
    /// Inserts content right after the element.
    abstract after: content: string * ?options: ContentOptions -> Element
    /// Removes the element and inserts content in place of it.
    abstract replace: content: string * ?options: ContentOptions -> Element
    /// Removes the element with all its content.
    abstract remove: unit -> Element

type [<AllowNullLiteral>] Doctype =
    abstract name: string option
    /// Read-Only, The quoted string in the doctype after the PUBLIC atom.
    abstract publicId: string option
    /// Read-Only, The quoted string in the doctype after the SYSTEM atom or immediately after the publicId.
    abstract systemId: string option

type [<AllowNullLiteral>] DocumentEnd =
    /// Inserts content right after the end of the document.
    abstract append: content: string * ?options: ContentOptions -> DocumentEnd

type [<AllowNullLiteral>] ElementHandler =
    /// An incoming element, such as `div`
    abstract element: element: Element -> U2<unit, Promise<unit>>
    /// An incoming comment
    abstract comments: comment: Comment -> U2<unit, Promise<unit>>
    /// An incoming piece of text
    abstract text: text: Text -> U2<unit, Promise<unit>>

type [<AllowNullLiteral>] DocumentHandler =
    /// An incoming doctype, such as <!DOCTYPE html>
    abstract doctype: doctype: Doctype -> U2<unit, Promise<unit>>
    /// An incoming comment
    abstract comments: comment: Comment -> U2<unit, Promise<unit>>
    /// An incoming piece of text
    abstract text: text: Text -> U2<unit, Promise<unit>>
    /// The ending of the document
    abstract ``end``: ``end``: DocumentEnd -> U2<unit, Promise<unit>>

type [<AllowNullLiteral>] HTMLRewriter =
    abstract on: selector: string * handlers: ElementHandler -> HTMLRewriter
    abstract onDocument: handlers: DocumentHandler -> HTMLRewriter
    abstract transform: response: Response -> Response

type [<AllowNullLiteral>] HTMLRewriterStatic =
    [<Emit "new $0($1...)">] abstract Create: unit -> HTMLRewriter

type [<AllowNullLiteral>] CacheStorage =
    abstract ``default``: obj with get, set //TODO: cache

type KVValue<'Value> =
    Promise<'Value option>

type KVValueWithMetadata<'Value, 'Metadata> =
    Promise<KVValueWithMetadataPromise<'Value, 'Metadata>>

type [<AllowNullLiteral>] KVNamespace =
    abstract get: key: string -> KVValue<string>
    [<Emit "$0.get($1,'text')">] abstract get_text: key: string -> KVValue<string>
    [<Emit "$0.get($1,'json')">] abstract get_json: key: string -> KVValue<'ExpectedValue>
    [<Emit "$0.get($1,'arrayBuffer')">] abstract get_arrayBuffer: key: string -> KVValue<ArrayBuffer>
    [<Emit "$0.get($1,'stream')">] abstract get_stream: key: string -> KVValue<Readable<'T>>
    abstract getWithMetadata: key: string -> KVValueWithMetadata<string, 'Metadata>
    [<Emit "$0.getWithMetadata($1,'text')">] abstract getWithMetadata_text: key: string -> KVValueWithMetadata<string, 'Metadata>
    [<Emit "$0.getWithMetadata($1,'json')">] abstract getWithMetadata_json: key: string -> KVValueWithMetadata<'ExpectedValue, 'Metadata>
    [<Emit "$0.getWithMetadata($1,'arrayBuffer')">] abstract getWithMetadata_arrayBuffer: key: string -> KVValueWithMetadata<ArrayBuffer, 'Metadata>
    [<Emit "$0.getWithMetadata($1,'stream')">] abstract getWithMetadata_stream: key: string -> KVValueWithMetadata<Readable<'Data>, 'Metadata>
    abstract put: key: string * value: U3<string, Readable<'Data>, ArrayBuffer> * ?options: KVNamespacePutOptions -> Promise<unit>
    abstract delete: key: string -> Promise<unit>
    abstract list: ?options: KVNamespaceListOptions -> Promise<KVNamespaceListPromise>

type [<AllowNullLiteral>] KVNamespacePutOptions =
    abstract expiration: U2<string, float> option with get, set
    abstract expirationTtl: U2<string, float> option with get, set
    abstract metadata: obj option with get, set

type [<AllowNullLiteral>] KVNamespaceListOptions =
    abstract prefix: string option with get, set
    abstract limit: float option with get, set
    abstract cursor: string option with get, set

type [<AllowNullLiteral>] DurableObjectEntries<'T> =
    [<Emit "$0[$1]">] abstract Item: key: string -> 'T with get
    [<Emit "$0[$1]=$2">] abstract Item: key: string -> 'T with set

type [<AllowNullLiteral>] DurableObjectListOptions =
    abstract start: string option with get, set
    abstract ``end``: string option with get, set
    abstract reverse: bool option with get, set
    abstract limit: float option with get, set

type [<AllowNullLiteral>] DurableObjectOperator =
    abstract get: key: string -> Promise<'T>
    abstract get: keys: Array<string> -> Promise<Map<string, 'T>>
    abstract put: key: string * value: 'T -> Promise<unit>
    abstract put: entries: DurableObjectEntries<'T> -> Promise<unit>
    abstract delete: key: string -> Promise<bool>
    abstract delete: keys: Array<string> -> Promise<bool>
    abstract list: ?options: DurableObjectListOptions -> Promise<Map<string, 'T>>

type [<AllowNullLiteral>] DurableObjectTransaction =
    inherit DurableObjectOperator
    abstract rollback: unit -> unit

type [<AllowNullLiteral>] DurableObjectStorage =
    inherit DurableObjectOperator
    abstract transaction: closure: (DurableObjectStorage -> Promise<unit>) -> Promise<Map<string, 'T>>

type [<AllowNullLiteral>] DurableObjectState =
    abstract storage: DurableObjectStorage with get, set

/// DurableObject is a class that defines a template for creating Durable Objects
type [<AllowNullLiteral>] DurableObject =
    abstract fetch: (CfRequest -> RequestInfo -> Promise<Response>) with get, set

/// DurableObjectStub is a client object used to send requests to a remote Durable Object
type [<AllowNullLiteral>] DurableObjectStub =
    abstract name: string option with get, set
    abstract id: DurableObjectId with get, set
    abstract fetch: (CfRequest -> RequestInfo -> Promise<Response>) with get, set

type [<AllowNullLiteral>] DurableObjectId =
    abstract name: string option with get, set
    abstract toString: (unit -> string) with get, set

type [<AllowNullLiteral>] DurableObjectNamespace =
    abstract newUniqueId: (unit -> DurableObjectId) with get, set
    abstract idFromName: (string -> DurableObjectId) with get, set
    abstract idFromString: (string -> DurableObjectId) with get, set
    abstract get: (DurableObjectId -> DurableObjectStub) with get, set

type [<AllowNullLiteral>] RequestInitCfPropertiesCacheTtlByStatus =
    [<Emit "$0[$1]">] abstract Item: key: string -> float with get
    [<Emit "$0[$1]=$2">]abstract Item: key: string -> float with set

type [<AllowNullLiteral>] RequestInitCfPropertiesMinify =
    abstract javascript: bool option with get, set
    abstract css: bool option with get, set
    abstract html: bool option with get, set

type [<AllowNullLiteral>] IncomingRequestCfPropertiesBotManagement =
    abstract score: float with get, set
    abstract staticResource: bool with get, set
    abstract verifiedBot: bool with get, set

type [<StringEnum>] [<RequireQualifiedAccess>] IncomingRequestCfPropertiesTlsClientAuthCertPresented =
    | [<CompiledName "0">] N0
    | [<CompiledName "1">] N1

type [<AllowNullLiteral>] IncomingRequestCfPropertiesTlsClientAuth =
    abstract certIssuerDNLegacy: string with get, set
    abstract certIssuerDN: string with get, set
    abstract certPresented: IncomingRequestCfPropertiesTlsClientAuthCertPresented with get, set
    abstract certSubjectDNLegacy: string with get, set
    abstract certSubjectDN: string with get, set
    abstract certNotBefore: string with get, set
    abstract certNotAfter: string with get, set
    abstract certSerial: string with get, set
    abstract certFingerprintSHA1: string with get, set
    abstract certVerified: string with get, set

type [<AllowNullLiteral>] KVValueWithMetadataPromise<'Value, 'Metadata> =
    abstract value: 'Value option with get, set
    abstract metadata: 'Metadata option with get, set

type [<AllowNullLiteral>] KVNamespaceListPromiseKeys =
    abstract name: string with get, set
    abstract expiration: float option with get, set
    abstract metadata: obj option with get, set

type [<AllowNullLiteral>] KVNamespaceListPromise =
    abstract keys: ResizeArray<KVNamespaceListPromiseKeys> with get, set
    abstract list_complete: bool with get, set
    abstract cursor: string with get, set


[<Emit "addEventListener('fetch',$0)">]
let addEventListener_fetch (e:FetchEvent-> unit) : unit = jsNative

[<Emit "addEventListener('scheduled',$0)">]
let addEventListener_scheduled (e:ScheduledEvent -> unit) : unit = jsNative