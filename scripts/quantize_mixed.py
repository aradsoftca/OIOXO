"""Mixed quantization toward ~67-80MB, browser-runnable:
   1) 4-bit the MatMul weights (MatMulNBits), 2) int8 the remaining fp32
   weights (the big embedding table) on top. Both ops run in onnxruntime-web.
"""
import os, shutil, tempfile, onnx
from onnxruntime.quantization.matmul_nbits_quantizer import MatMulNBitsQuantizer
from onnxruntime.quantization import quantize_dynamic, QuantType

SRC = "writer7-onnx/model.onnx"
WRITER = "writer7"
OUT = "writer7-hf"
os.makedirs(os.path.join(OUT, "onnx"), exist_ok=True)

# 1) 4-bit MatMuls
m = onnx.load(SRC)
try:
    q = MatMulNBitsQuantizer(m, block_size=32, is_symmetric=True)
except TypeError:
    from onnxruntime.quantization.matmul_nbits_quantizer import DefaultWeightOnlyQuantConfig
    q = MatMulNBitsQuantizer(m, algo_config=DefaultWeightOnlyQuantConfig(block_size=32, is_symmetric=True))
q.process()
qm = getattr(q, "model", q)
tmp = os.path.join(tempfile.gettempdir(), "w7_4bit.onnx")
if hasattr(qm, "save_model_to_file"):
    qm.save_model_to_file(tmp, use_external_data_format=False)
else:
    onnx.save(getattr(qm, "model", qm), tmp)
print("after 4-bit matmul MB:", round(os.path.getsize(tmp) / 1048576, 1))

# 2) int8 the leftover fp32 (embeddings) on top
out_onnx = os.path.join(OUT, "onnx", "model_q4.onnx")
try:
    quantize_dynamic(tmp, out_onnx, weight_type=QuantType.QInt8)
    print("after +int8 embeddings MB:", round(os.path.getsize(out_onnx) / 1048576, 1))
except Exception as e:
    print("int8-on-top FAILED:", type(e).__name__, str(e)[:200])
    shutil.copy(tmp, out_onnx)
    print("kept 4-bit-only MB:", round(os.path.getsize(out_onnx) / 1048576, 1))

for f in ["config.json", "generation_config.json", "tokenizer.json", "tokenizer_config.json",
          "special_tokens_map.json", "vocab.json", "merges.txt"]:
    s = os.path.join(WRITER, f)
    if os.path.exists(s):
        shutil.copy(s, os.path.join(OUT, f))
print("DONE files:", sorted(os.listdir(OUT)))
