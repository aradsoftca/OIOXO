@echo off
cd /d C:\science\brain
set PYTHONUTF8=1
set TRANSFORMERS_OFFLINE=1
set HF_HUB_OFFLINE=1
C:\science\.venv\Scripts\python1.exe -u train_fusion.py fusion-data.jsonl SmolLM2-135M-Instruct > train135.log 2>&1
echo DONE_EXIT_%errorlevel% >> train135.log
move /Y fusion-final fusion-135 >> train135.log 2>&1
echo MOVED_135_DONE >> train135.log
