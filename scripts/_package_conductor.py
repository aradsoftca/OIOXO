"""On arad: quantize the conductor ONNX to int8 and assemble a transformers.js
layout (config + tokenizer at root, onnx/model_quantized.onnx). Run with the
science venv python1.exe. Frees the 2GB fp32 afterward."""
import os, shutil, glob
from onnxruntime.quantization import quantize_dynamic, QuantType

SRC = r"C:\Users\Arad\oioxo-conductor\conductor"   # original HF model (tokenizer/config)
ONX = r"C:\Users\Arad\oioxo-conductor\onnx"         # optimum fp32 export
OUT = r"C:\Users\Arad\oioxo-conductor\pkg"          # transformers.js-ready

os.makedirs(os.path.join(OUT, "onnx"), exist_ok=True)

# config + tokenizer files at the repo root (transformers.js expects them here)
for f in ["config.json", "generation_config.json"]:
    p = os.path.join(ONX, f)
    if os.path.exists(p):
        shutil.copy(p, os.path.join(OUT, f))
for f in ["tokenizer.json", "tokenizer_config.json", "special_tokens_map.json",
          "vocab.json", "merges.txt"]:
    p = os.path.join(SRC, f)
    if os.path.exists(p):
        shutil.copy(p, os.path.join(OUT, f))

# int8 dynamic quantization → single ~500MB file transformers.js loads as
# onnx/model_quantized.onnx (quantized:true)
quantize_dynamic(
    os.path.join(ONX, "model.onnx"),
    os.path.join(OUT, "onnx", "model_quantized.onnx"),
    weight_type=QuantType.QInt8,
)
print("QUANT_DONE")

for f in sorted(glob.glob(os.path.join(OUT, "**", "*"), recursive=True)):
    if os.path.isfile(f):
        print(f"{os.path.getsize(f):>12} {f}")
