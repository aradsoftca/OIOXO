"""
Qwen3-0.6B REPRESENTATIVE test — runs the 4-bit GGUF (what real users get is the
~350MB q4 build) via llama.cpp on CPU, across many real Xonvert prompts. Reports
the decider's choices and the synthesis quality in production mode (thinking
OFF), plus a couple of ON spot-checks. Lets us judge real-user quality + confirm
the thinking decision at the quantization users actually run.

Run with the Python that has llama-cpp-python:
  py -3.13 scripts/model_test.py
"""
import time, re, os
from llama_cpp import Llama

GGUF = os.path.join(os.path.dirname(__file__), "qwen3-q4.gguf")
print(f"loading {GGUF} (4-bit, CPU)…")
llm = Llama(model_path=GGUF, n_ctx=4096, n_threads=os.cpu_count(), verbose=False)
print("loaded.\n")

def run(messages, thinking, max_tokens=384):
    msgs = [dict(m) for m in messages]
    if not thinking:  # production mode: disable Qwen3 reasoning
        msgs[0]["content"] += " /no_think"
    t0 = time.time()
    out = llm.create_chat_completion(messages=msgs, max_tokens=max_tokens, temperature=0)
    dt = time.time() - t0
    raw = out["choices"][0]["message"]["content"]
    think = ""
    m = re.search(r"<think>(.*?)</think>", raw, re.S)
    if m:
        think = m.group(1).strip(); answer = raw[m.end():].strip()
    else:
        answer = re.sub(r"</?think>", "", raw).strip()
    return {"answer": answer, "think": think, "secs": round(dt, 1)}

DECIDER_SYS = (
    'You route a user request for Xonvert, a file-tools + answer app. Choose ONE action:\n'
    '- "tool": the user wants to DO something to a file or create/convert/edit/generate — set "tool" to the best id from the list.\n'
    '- "search": the user asks a question or wants facts, info, news, prices, definitions — set "query" to a concise web search.\n'
    '- "chat": greeting, thanks, or small talk.\n'
    'Prefer "search" for any factual question — never answer facts from memory. '
    'Reply with ONLY JSON: {"action":"tool|search|chat","tool":"","query":""}.'
)
def du(req, tools, hf):
    return f'Request: "{req}"\nAttached file: {"yes" if hf else "no"}\nRelevant tools:\n' + "\n".join(f"- {i}: {n} — {b}" for i,n,b in tools)

T_IMG = [("image-compress","Compress Image","shrink file size"),("image-resize","Resize Image","change dimensions")]
T_PDF = [("pdf-merge","Merge PDF","combine pdfs"),("pdf-compress","Compress PDF","shrink pdf"),("doc-convert","Doc Convert","word↔pdf")]
T_AUD = [("audio-convert-format","Convert Audio","mp3/wav"),("audio-trim","Trim Audio","cut")]
DECIDER = [
    ("compress this image", T_IMG, True),
    ("turn this pdf into word", T_PDF, True),
    ("convert this song to mp3", T_AUD, True),
    ("what's the capital of australia", [("time-world-clock","World Clock","clocks")], False),
    ("how much is 1 dollar in euro", [("finance-currency","Currency","convert money")], False),
    ("best laptop for students 2026", [], False),
    ("remove the background from my photo", [("image-remove-bg","Remove BG","cut out subject"),("image-crop","Crop","trim")], True),
    ("hey how's it going", [], False),
    ("summarize this pdf for me", T_PDF, True),
    ("what does API mean", [("dev-json-format","JSON","format")], False),
]

SYN_SYS = ('Answer the question using ONLY the sources below. Be SHORT — 2–3 sentences, direct, no filler, '
           'no preamble. Merge the key facts; do not copy one source verbatim; add nothing not in the sources.')
SYN = [
    ("how do solar panels work",
     'Source 1 (energysage.com):\n"""Solar panels are made of photovoltaic (PV) cells. Sunlight knocks electrons loose; the cell\'s electric field forces them to flow, creating direct current (DC)."""\n\n'
     'Source 2 (energy.gov):\n"""An inverter converts the DC into alternating current (AC), which homes and the grid use. Excess power can be exported to the grid."""'),
    ("why is the sky blue",
     'Source 1 (nasa.gov):\n"""Sunlight is made of all colors. Air molecules scatter shorter (blue) wavelengths much more than longer (red) ones — Rayleigh scattering."""\n\n'
     'Source 2 (sciencedaily):\n"""Because blue light is scattered in all directions across the sky, we see the sky as blue when looking away from the sun."""'),
    ("what is the difference between http and https",
     'Source 1 (cloudflare.com):\n"""HTTP sends data in plaintext. HTTPS adds TLS encryption, so data between browser and server is encrypted and tamper-evident."""\n\n'
     'Source 2 (mozilla):\n"""HTTPS also authenticates the server via certificates, protecting against impersonation. It is now the default for the web."""'),
]

print("="*70 + "\nDECIDER (production mode: thinking OFF) — 4-bit\n" + "="*70)
for req, tools, hf in DECIDER:
    r = run([{"role":"system","content":DECIDER_SYS},{"role":"user","content":du(req,tools,hf)}], thinking=False, max_tokens=80)
    print(f'  {r["secs"]}s  "{req}" → {r["answer"][:120]}')

print("\n" + "="*70 + "\nSYNTHESIS (thinking OFF) — 4-bit, real-user quality\n" + "="*70)
for q, notes in SYN:
    r = run([{"role":"system","content":SYN_SYS},{"role":"user","content":f"{notes}\n\nQuestion: {q}"}], thinking=False, max_tokens=200)
    print(f'\n  "{q}"  ({r["secs"]}s)\n    {r["answer"][:340]}')

print("\n" + "="*70 + "\nON spot-check (does thinking change the answer at 4-bit?)\n" + "="*70)
r = run([{"role":"system","content":SYN_SYS},{"role":"user","content":f"{SYN[0][1]}\n\nQuestion: {SYN[0][0]}"}], thinking=True, max_tokens=420)
print(f'  solar (ON) {r["secs"]}s: {r["answer"][:300]}')
print("\ndone.")
