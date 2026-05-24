"""Embed the chat template into writer8-hf/tokenizer_config.json so transformers.js
apply_chat_template() works (newer transformers split it into chat_template.jinja,
which transformers.js doesn't read). Uses writer8's own trained template."""
import json, os, shutil
JINJA = "writer8/chat_template.jinja"
# SmolLM2 ChatML fallback if the .jinja isn't present.
FALLBACK = ("{% for message in messages %}{{'<|im_start|>' + message['role'] + '\n' + "
            "message['content'] + '<|im_end|>' + '\n'}}{% endfor %}"
            "{% if add_generation_prompt %}{{ '<|im_start|>assistant\n' }}{% endif %}")
tmpl = open(JINJA, encoding="utf-8").read().strip() if os.path.exists(JINJA) else FALLBACK
shutil.copy("writer8/tokenizer_config.json", "writer8-hf/tokenizer_config.json")
cfg = json.load(open("writer8-hf/tokenizer_config.json", encoding="utf-8"))
cfg["chat_template"] = tmpl
json.dump(cfg, open("writer8-hf/tokenizer_config.json", "w", encoding="utf-8"), ensure_ascii=False)
print("source:", "writer8/chat_template.jinja" if os.path.exists(JINJA) else "FALLBACK", "| chars:", len(tmpl))
print("first 120:", tmpl[:120].replace("\n", "\\n"))
