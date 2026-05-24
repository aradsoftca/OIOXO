"""4-bit quantize writer7's ONNX (~67MB) and assemble a transformers.js repo folder.

Output: writer7-hf/  (config + tokenizer + onnx/model_q4.onnx) ready to push to HF.
  python quantize4.py
"""
import os, shutil, onnx

SRC_ONNX = "writer7-onnx/model.onnx"   # fp32 export
WRITER = "writer7"                       # training output (has tokenizer)
OUT = "writer7-hf"
os.makedirs(os.path.join(OUT, "onnx"), exist_ok=True)

# 4-bit weight quantization (MatMulNBits) — transformers.js loads this as dtype:'q4'.
from onnxruntime.quantization.matmul_nbits_quantizer import MatMulNBitsQuantizer

model = onnx.load(SRC_ONNX)
try:
    q = MatMulNBitsQuantizer(model, block_size=32, is_symmetric=True)
except TypeError:
    from onnxruntime.quantization.matmul_nbits_quantizer import DefaultWeightOnlyQuantConfig
    q = MatMulNBitsQuantizer(model, algo_config=DefaultWeightOnlyQuantConfig(block_size=32, is_symmetric=True))
q.process()
out_onnx = os.path.join(OUT, "onnx", "model_q4.onnx")
qmodel = getattr(q, "model", q)
if hasattr(qmodel, "save_model_to_file"):
    qmodel.save_model_to_file(out_onnx, use_external_data_format=False)
else:
    onnx.save(getattr(qmodel, "model", qmodel), out_onnx)

# Copy config + tokenizer so transformers.js can load the repo standalone.
for f in ["config.json", "generation_config.json", "tokenizer.json", "tokenizer_config.json",
          "special_tokens_map.json", "vocab.json", "merges.txt"]:
    src = os.path.join(WRITER, f)
    if os.path.exists(src):
        shutil.copy(src, os.path.join(OUT, f))

mb = os.path.getsize(out_onnx) / 1024 / 1024
print(f"model_q4.onnx = {mb:.1f} MB")
print("files:", sorted(os.listdir(OUT)), "+ onnx/", sorted(os.listdir(os.path.join(OUT, "onnx"))))
