"""Mixed quantization for writer8 (the method that made writer7 ~92MB):
   1) 4-bit MatMul weights (MatMulNBits), 2) int8 the leftover fp32 embedding.
Both run in onnxruntime-web (transformers.js dtype 'q4'). Reports size vs the
90MB budget. block_size configurable (bigger = smaller file, slight quality cost).
  python quantize_mixed_w8.py [block_size]
"""
import os, sys, shutil, tempfile, onnx
from onnxruntime.quantization.matmul_nbits_quantizer import MatMulNBitsQuantizer
from onnxruntime.quantization import quantize_dynamic, QuantType

SRC = "writer8-onnx/model.onnx"
WRITER = "writer8"
OUT = "writer8-hf"
BLOCK = int(sys.argv[1]) if len(sys.argv) > 1 else 32
os.makedirs(os.path.join(OUT, "onnx"), exist_ok=True)

m = onnx.load(SRC)
try:
    q = MatMulNBitsQuantizer(m, block_size=BLOCK, is_symmetric=True)
except TypeError:
    from onnxruntime.quantization.matmul_nbits_quantizer import DefaultWeightOnlyQuantConfig
    q = MatMulNBitsQuantizer(m, algo_config=DefaultWeightOnlyQuantConfig(block_size=BLOCK, is_symmetric=True))
q.process()
qm = getattr(q, "model", q)
tmp = os.path.join(tempfile.gettempdir(), "w8_4bit.onnx")
if hasattr(qm, "save_model_to_file"):
    qm.save_model_to_file(tmp, use_external_data_format=False)
else:
    onnx.save(getattr(qm, "model", qm), tmp)
print(f"[block={BLOCK}] after 4-bit matmul MB:", round(os.path.getsize(tmp) / 1048576, 1))

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
final = round(os.path.getsize(out_onnx) / 1048576, 1)
print(f"\nFINAL model_q4.onnx = {final} MB  (budget 90)  -> {'UNDER ✓' if final <= 90 else 'OVER ✗'}")
