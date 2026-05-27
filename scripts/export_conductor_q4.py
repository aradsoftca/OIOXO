"""
4-bit (q4) quantize the conductor's fp32 ONNX -> ~180MB, for the on-device size budget
(<=180MB, project_model_size_budget). Uses onnxruntime MatMulNBitsQuantizer (QOperator /
MatMulNBits) which onnxruntime-web >=1.17 executes (we load it via @huggingface/transformers
v4, bundles ort-web 1.26). block_size=32 = quality-leaning (smaller blocks, less error).

In: conductor-pkg/onnx/decoder_model_merged.onnx (fp32, from export_conductor.py)
Out: conductor-pkg/onnx/decoder_model_merged_q4.onnx (~180-195MB int4)

Run on arad: set "PYTHONUTF8=1"&& C:\\science\\.venv\\Scripts\\python1.exe -u export_conductor_q4.py
"""
import os
import onnx
from onnxruntime.quantization.matmul_nbits_quantizer import MatMulNBitsQuantizer, QuantFormat

SRC = os.path.join("conductor-pkg", "onnx", "decoder_model_merged.onnx")
OUT = os.path.join("conductor-pkg", "onnx", "decoder_model_merged_q4.onnx")

print(f"loading fp32 {SRC} ({round(os.path.getsize(SRC)/1e6,1)}MB)...")
model = onnx.load(SRC)

# 4-bit, block 32, symmetric, MatMulNBits op (QOperator) — the web-loadable 4-bit format.
# Quantize BOTH MatMul (transformer layers) AND Gather (the 47M-param embedding table) —
# else the fp32 embedding dominates (~188MB) and q4 is no smaller than int8. Embedding 4-bit
# emits GatherBlockQuantized (ort-web >=1.18). This is what actually reaches the ~180MB budget.
q = MatMulNBitsQuantizer(model, bits=4, block_size=32, is_symmetric=True,
                         quant_format=QuantFormat.QOperator,
                         op_types_to_quantize=("MatMul", "Gather"))
q.process()
q.model.save_model_to_file(OUT, use_external_data_format=False)
print(f"q4 -> {OUT} ({round(os.path.getsize(OUT)/1e6,1)}MB)")
print("Q4_DONE")
