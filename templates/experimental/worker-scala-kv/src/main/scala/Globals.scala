import scalajs.js
import js.annotation._

object KVNamespace {
  type KVValue = js.Promise[String]
}

@js.native
trait KVNamespace extends js.Object {
  import KVNamespace._

  def get(key: String): KVValue = js.native

  def put(key: String, value: String): js.Promise[Unit] = js.native

  def delete(key: String): js.Promise[Unit] = js.native
}

@js.native
@JSGlobalScope
object Globals extends js.Object {
  def addEventListener(`type`: String, f: js.Function): Unit = js.native

  val KV: KVNamespace = js.native
}
