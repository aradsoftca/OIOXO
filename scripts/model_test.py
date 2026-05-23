import re, os
from llama_cpp import Llama
llm = Llama(model_path=os.path.join(os.path.dirname(__file__),"qwen3-q4.gguf"), n_ctx=4096, n_threads=os.cpu_count(), verbose=False)
def g(sys,u): 
  o=llm.create_chat_completion(messages=[{"role":"system","content":sys},{"role":"user","content":u}],max_tokens=200,temperature=0.2)
  return re.sub(r"<think>.*?</think>","",o["choices"][0]["message"]["content"],flags=re.S).strip()
notes='Source 1 (wiki): The Nobel Prize in Physics is awarded annually by the Royal Swedish Academy. Past laureates include Einstein and Feynman.'
STRICT=('Answer using ONLY the sources. Copy every name and number EXACTLY as written — invent NOTHING. '
 'If the sources do not contain the answer, reply exactly: "I couldn\'t find that in the sources." Be SHORT. /no_think')
print("STRICT-RETRY on absent answer:")
print(" ", g(STRICT, f'{notes}\n\nQuestion: who won the 2025 nobel prize in physics'))
