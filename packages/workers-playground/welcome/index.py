from js import Response
import numpy as np

def fetch(request):
    print("Hi there!")
    arr = np.array([1, 2, 3])
    return Response.new(str(arr))