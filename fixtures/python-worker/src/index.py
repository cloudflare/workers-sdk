from js import Response
from other import add
from arith import mul
import bcrypt
def on_fetch(request):
  password = b"super secret password"
  hashed = bcrypt.hashpw(password, bcrypt.gensalt(14))
  return Response.new(f"Hi world {add(1,2)} {mul(2,3)} {hashed}")
