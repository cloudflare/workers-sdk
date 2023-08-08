import onnxmltools
from onnxconverter_common.data_types import FloatTensorType
from onnxmltools.convert import convert_xgboost
import xgboost

xbg_reg = xgboost.Booster()
xbg_reg.load_model("petals.json")

# define initial types
initial_type = [('float_input', FloatTensorType([None, 4]))]

# convert to onnx
onnx_model = convert_xgboost(xbg_reg, initial_types = initial_type)

# save new onnx model
onnxmltools.utils.save_model(onnx_model, 'petals.onnx')
