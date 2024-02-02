from js import Response
from other import add
from arith import mul
def fetch(request):
  return Response.new(f"Hi world {add(1,2)} {mul(2,3)}")