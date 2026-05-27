"""Strip initializers not referenced by any node (the orphaned fp32 embedding left
after 4-bit quantizing both MatMul + the tied Gather). In: q4 onnx; Out: *_slim.onnx."""
import os, onnx
SRC = os.path.join("conductor-pkg", "onnx", "decoder_model_merged_q4.onnx")
OUT = os.path.join("conductor-pkg", "onnx", "decoder_model_merged_q4_slim.onnx")
m = onnx.load(SRC)
used = set()
for n in m.graph.node:
    for i in n.input: used.add(i)
before = len(m.graph.initializer)
keep = [init for init in m.graph.initializer if init.name in used]
removed = [init.name for init in m.graph.initializer if init.name not in used]
del m.graph.initializer[:]
m.graph.initializer.extend(keep)
onnx.save(m, OUT)
print(f"initializers {before} -> {len(keep)} (removed {len(removed)})")
print("removed:", removed[:8])
print(f"size {round(os.path.getsize(SRC)/1e6,1)}MB -> {round(os.path.getsize(OUT)/1e6,1)}MB -> {OUT}")
print("SLIM_DONE")
