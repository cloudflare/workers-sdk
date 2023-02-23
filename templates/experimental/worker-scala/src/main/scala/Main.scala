import org.scalajs.dom.experimental.serviceworkers.{FetchEvent}
import org.scalajs.dom.experimental.{Request, Response, ResponseInit}
import scala.scalajs.js

object Main {
  def main(args: Array[String]): Unit = {
    Globals.addEventListener("fetch", (event: FetchEvent) => {
      event.respondWith(handleRequest(event.request))
    })
  }

  def handleRequest(request: Request): Response = {
    new Response("Scala Worker hello world", ResponseInit(
        _headers = js.Dictionary("content-type" -> "text/plain")))
  }
}
