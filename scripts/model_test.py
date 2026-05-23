"""
Qwen3-0.6B (4-bit, what users run) — HARD SCENARIO BATTERY.
Probes the real jobs the model does in Xonvert and grades how well it copes:
  A. Decider JSON (tool/search/chat) on ambiguous inputs
  B. Search-query writing from messy questions
  C. Grounded synthesis: agreeing / CONFLICTING / IRRELEVANT / SPARSE / ABSENT notes
  D. Summarization (long → short)
  E. Anti-hallucination: answer NOT in the notes — admit or fabricate?

Run:  py -3.13 scripts/model_test.py    (PYTHONUTF8=1)
"""
import time, re, os, json
from llama_cpp import Llama

GGUF = os.path.join(os.path.dirname(__file__), "qwen3-q4.gguf")
llm = Llama(model_path=GGUF, n_ctx=4096, n_threads=os.cpu_count(), verbose=False)

def gen(system, user, max_tokens=256):
    t0 = time.time()
    out = llm.create_chat_completion(messages=[{"role":"system","content":system+" /no_think"},{"role":"user","content":user}], max_tokens=max_tokens, temperature=0)
    raw = out["choices"][0]["message"]["content"]
    raw = re.sub(r"<think>.*?</think>", "", raw, flags=re.S).replace("<think>","").replace("</think>","").strip()
    return raw, round(time.time()-t0,1)

def grade(label, cond):
    print(f"      {'PASS' if cond else 'FAIL'} — {label}")

DECIDER_SYS=('You route a user request for Xonvert, a file-tools + answer app. Choose ONE action: '
 '"tool" (do something to a file / create / convert / edit — set tool to the best id), '
 '"search" (a question or facts — set query), "chat" (greeting/small talk). '
 'Prefer search for factual questions. Reply ONLY JSON: {"action":"...","tool":"","query":""}.')
def dmenu(req, tools, hf):
    return f'Request: "{req}"\nAttached file: {"yes" if hf else "no"}\nTools:\n'+"\n".join(f"- {i}: {n}" for i,n in tools)

SYN_SYS=('Answer using ONLY the sources below. Be SHORT — 2-3 sentences, no filler, no preamble. '
 'Merge key facts; if the sources disagree say so; if they do not contain the answer, say you could not find it. Add nothing not in the sources.')

print("="*72+"\nA. DECIDER on ambiguous inputs (valid JSON? sensible action?)\n"+"="*72)
A=[("compress this image",[("image-compress","Compress"),("image-resize","Resize")],True,"tool"),
   ("what's the boiling point of mercury",[("calc-temp","Temp Calc")],False,"search"),
   ("can you translate this and also make it louder",[("audio-volume","Volume"),("ai-translate","Translate")],True,"tool/translate?"),
   ("yo what's up",[],False,"chat"),
   ("is this a virus",[("dev-hash","Hash")],True,"search?")]
for req,tools,hf,exp in A:
    r,s=gen(DECIDER_SYS,dmenu(req,tools,hf),80); ok=False
    try: ok=isinstance(json.loads(re.search(r"\{.*\}",r,re.S).group()),dict)
    except: ok=False
    print(f'  "{req}" (exp {exp}) [{s}s]\n     {r[:120]}'); grade("valid JSON", ok)

print("\n"+"="*72+"\nB. SEARCH-QUERY writing from messy questions\n"+"="*72)
B=["why won't my sourdough rise","that movie with the blue cat-people on pandora","how do i stop my laptop fan being so loud","whats the deal with quantum computing"]
QSYS="Turn the user question into ONE focused web search query (keywords). Reply with just the query."
for q in B:
    r,s=gen(QSYS,q,40); print(f'  "{q}" [{s}s] → {r[:90]}')

print("\n"+"="*72+"\nC. GROUNDED SYNTHESIS — hard note conditions\n"+"="*72)
C=[("AGREE","how do solar panels work",
    'S1 (energysage): PV cells turn sunlight into DC electricity.\nS2 (energy.gov): An inverter converts DC to AC for homes.'),
   ("CONFLICT","is coffee good for your heart",
    'S1 (healthline): Moderate coffee is linked to lower heart-disease risk.\nS2 (webmd): Some studies link heavy coffee intake to higher blood pressure and heart strain.'),
   ("IRRELEVANT","what is the capital of australia",
    'S1 (wiki): Canberra is the capital of Australia, chosen as a compromise between Sydney and Melbourne.\nS2 (foodblog): The best pavlova recipe uses fresh egg whites and caster sugar.'),
   ("SPARSE","how tall is mount kilimanjaro",
    'S1 (wiki): Mount Kilimanjaro is in Tanzania.'),
   ("ABSENT","who won the 2025 nobel prize in physics",
    'S1 (wiki): The Nobel Prize in Physics is awarded annually by the Royal Swedish Academy of Sciences.\nS2 (history): Past laureates include Einstein (1921) and Feynman (1965).')]
for kind,q,notes in C:
    r,s=gen(SYN_SYS,f"{notes}\n\nQuestion: {q}",200)
    print(f'  [{kind}] "{q}" [{s}s]\n     {r[:300]}')

print("\n"+"="*72+"\nD. SUMMARIZE long → short\n"+"="*72)
LONG=("The mitochondrion is a double-membrane-bound organelle found in most eukaryotic cells. "
 "It generates most of the cell's supply of ATP, used as chemical energy. Mitochondria have their own DNA, "
 "inherited maternally, and are thought to have originated from free-living bacteria via endosymbiosis. "
 "They are involved in signalling, cellular differentiation, and cell death, as well as maintaining control of the cell cycle and growth.")
r,s=gen("Summarize the text in 2 short sentences, using only the text. /no_think",LONG,120)
print(f'  [{s}s] {r[:280]}')

print("\n"+"="*72+"\nE. ANTI-HALLUCINATION (answer NOT in notes — does it admit?)\n"+"="*72)
r,s=gen(SYN_SYS,'S1 (wiki): The Great Wall of China is a series of fortifications built across northern China.\n\nQuestion: how many bricks are in the Great Wall',200)
print(f'  [{s}s] {r[:300]}')
print("\ndone.")
