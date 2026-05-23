import re, os
from llama_cpp import Llama
llm = Llama(model_path=os.path.join(os.path.dirname(__file__),"qwen3-q4.gguf"), n_ctx=4096, n_threads=os.cpu_count(), verbose=False)
SYS=('Answer using ONLY the sources below. Be SHORT — 2-3 sentences. Connect the facts across sources to explain. '
 'If the sources do not support a connection or answer, say you could not find it. Add nothing not in the sources. /no_think')
def ans(notes,q,mx=220):
  o=llm.create_chat_completion(messages=[{"role":"system","content":SYS},{"role":"user","content":f"{notes}\n\nQuestion: {q}"}],max_tokens=mx,temperature=0)
  return re.sub(r"<think>.*?</think>","",o["choices"][0]["message"]["content"],flags=re.S).strip()
print("=== MULTI-HOP: WHY (connect multiple causes) ===")
print(ans('S1: The Western Roman Empire faced repeated invasions by Germanic tribes in the 4th-5th centuries.\nS2: Economic troubles, heavy taxation, and reliance on slave labour weakened the Roman economy.\nS3: Political instability saw rapid turnover of emperors and civil wars.','why did the western roman empire fall')[:340])
print("\n=== MULTI-HOP: BRIDGE (hop A→B→C) ===")
print(ans('S1: The Eiffel Tower is located in Paris, France.\nS2: Paris is the capital city of France.','what is the capital of the country where the eiffel tower is')[:200])
print("\n=== MULTI-HOP: HOW (mechanism) ===")
print(ans('S1: Chlorophyll in plant leaves absorbs sunlight.\nS2: The absorbed light energy splits water into oxygen and hydrogen.\nS3: The hydrogen combines with carbon dioxide to form glucose, releasing oxygen.','how does photosynthesis produce oxygen')[:300])
print("\n=== ANTI-HALLUC: connection NOT in notes ===")
print(ans('S1: Coffee contains caffeine, a stimulant.\nS2: Some people report trouble sleeping.','does coffee cause cancer')[:280])
print("\ndone.")
