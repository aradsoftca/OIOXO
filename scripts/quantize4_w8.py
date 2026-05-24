"""4-bit quantize writer8's ONNX (~67MB target) into a transformers.js repo folder.

Output: writer8-hf/ (config + tokenizer + onnx/model_q4.onnx) ready to push to HF.
Hard-fails if the q4 model exceeds the 90MB brand budget.
  python quantize4_w8.py
"""
import os, shutil, sys, onnx

SRC_ONNX = "writer8-onnx/model.onnx"
WRITER = "writer8"
OUT = "writer8-hf"
BUDGET_MB = 90

os.makedirs(os.path.join(OUT, "onnx"), exist_ok=True)
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

for f in ["config.json", "generation_config.json", "tokenizer.json", "tokenizer_config.json",
          "special_tokens_map.json", "vocab.json", "merges.txt"]:
    src = os.path.join(WRITER, f)
    if os.path.exists(src):
        shutil.copy(src, os.path.join(OUT, f))

mb = os.path.getsize(out_onnx) / 1024 / 1024
print(f"model_q4.onnx = {mb:.1f} MB  (budget {BUDGET_MB} MB)")
print("files:", sorted(os.listdir(OUT)), "+ onnx/", sorted(os.listdir(os.path.join(OUT, "onnx"))))
if mb > BUDGET_MB:
    print(f"!! OVER BUDGET ({mb:.1f} > {BUDGET_MB} MB) — do NOT ship this."); sys.exit(2)
print(f"OK: under budget by {BUDGET_MB - mb:.1f} MB")
