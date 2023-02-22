import org.w3c.fetch.Request
import org.w3c.fetch.Response
import org.w3c.fetch.ResponseInit

@OptIn(ExperimentalJsExport::class)
@JsExport
fun fetch(request: Request) : Response {
    val headers: dynamic = object {}
    headers["content-type"] = "text/plain"
    return Response(
        "Kotlin Worker hello world",
        ResponseInit(headers = headers)
    )
}
