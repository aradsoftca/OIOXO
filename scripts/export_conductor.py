"""
Export the trained CONDUCTOR to ONNX (transformers.js layout), quantized, on arad.

conductor-final/ (PyTorch SmolLM2-360M causal LM) -> conductor-pkg/ :
  config.json, generation_config.json, tokenizer files at ROOT
  onnx/decoder_model_merged.onnx            (fp32, merged KV-cache decoder)
  onnx/decoder_model_merged_quantized.onnx  (int8 — what transformers.js loads)

The quantized file is what lib/ai/conductor.ts points onnxUrl at
(onnx/decoder_model_merged_quantized.onnx). It is then ENCRYPTED locally with
scripts/encrypt_model.ts (deriveAssetKey(master,'models/oioxo-conductor','v1'))
and the .enc + public config/tokenizer uploaded to HF payam1394/oioxo-conductor.
A 360M decoder int8 ≈ 180–230 MB → gated download, runs on WASM/CPU (no WebGPU needed).

Run on arad (cmd.exe, offline):
  cd /d C:\\science\\brain && set "PYTHONUTF8=1"&& set "TRANSFORMERS_OFFLINE=1"&& ^
  C:\\science\\.venv\\Scripts\\python1.exe -u export_conductor.py
"""
import glob
import os

from onnxruntime.quantization import QuantType, quantize_dynamic
from optimum.exporters.onnx import main_export

SRC = "conductor-final"
OUT = "conductor-pkg"

# task=text-generation-with-past → merged decoder with KV-cache (what transformers.js wants).
main_export(model_name_or_path=SRC, output=OUT, task="text-generation-with-past", opset=14)

onnx_dir = os.path.join(OUT, "onnx")
os.makedirs(onnx_dir, exist_ok=True)
# optimum may emit at root or already under onnx/ depending on version — normalize.
for f in glob.glob(os.path.join(OUT, "*.onnx")) + glob.glob(os.path.join(OUT, "*.onnx_data")):
    os.replace(f, os.path.join(onnx_dir, os.path.basename(f)))

# Find the merged decoder fp32 and quantize it to int8.
cands = [f for f in os.listdir(onnx_dir) if f.endswith(".onnx") and "quantized" not in f]
merged = next((f for f in cands if "merged" in f), cands[0] if cands else None)
if not merged:
    raise SystemExit("no decoder .onnx produced by export")
fp32 = os.path.join(onnx_dir, merged)
qname = merged.replace(".onnx", "_quantized.onnx")
quantize_dynamic(fp32, os.path.join(onnx_dir, qname), weight_type=QuantType.QInt8)

print("PKG root:", sorted(os.listdir(OUT)))
print("PKG onnx:", sorted(os.listdir(onnx_dir)))
print("sizes(MB):", {f: round(os.path.getsize(os.path.join(onnx_dir, f)) / 1e6, 1)
                     for f in os.listdir(onnx_dir) if f.endswith(".onnx")})
print("QUANTIZED FILE for conductor.ts onnxUrl:", qname)
print("EXPORT_DONE")
