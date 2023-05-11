import scalajs.js
import js.annotation._

@js.native
@JSGlobalScope
object Globals extends js.Object {
  def addEventListener(`type`: String, f: js.Function): Unit = js.native
}
