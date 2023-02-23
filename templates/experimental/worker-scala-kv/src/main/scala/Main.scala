import org.scalajs.dom
import org.scalajs.dom.experimental.serviceworkers.{FetchEvent}
import org.scalajs.dom.experimental.{HttpMethod, Request, Response, ResponseInit}
import scala.scalajs.js
import js.JSConverters._
import scala.concurrent.Future
import scala.concurrent.ExecutionContext.Implicits.global

object Main {
  val okInit = ResponseInit(
    _status = 200,
    _headers = js.Dictionary("content-type" -> "text/plain")
  )

  val errInit = ResponseInit(
    _status = 400,
    _headers = js.Dictionary("content-type" -> "text/plain")
  )

  def main(args: Array[String]): Unit = {
    Globals.addEventListener("fetch", (event: FetchEvent) => {
      event.respondWith(handleRequest(event.request).toJSPromise)
    })
  }

  def handleRequest(request: Request): Future[Response] = {
    (request.method, request.url.split("/")) match {
      case (HttpMethod.GET, Array(_, _, _, key)) =>
        get(key)
      case (HttpMethod.PUT, Array(_, _, _, key, value)) =>
        put(key, value)
      case _ =>
        Future.successful(
          new Response("expected GET /key or PUT /key/value", errInit))
    }
  }

  def get(key: String): Future[Response] = {
    Globals.KV.get(key).toFuture.map { (value: String) =>
        new Response(value, okInit)
    } recover {
      case err =>
        new Response(s"error getting a value for '$key': $err", errInit)
    }
  }

  def put(key: String, value: String): Future[Response] = {
    Globals.KV.put(key, value).toFuture.map { (_) =>
      new Response("", okInit)
    } recover {
      case err =>
        new Response(s"error putting '$value' into '$key': $err", errInit)
    }
  }
}
