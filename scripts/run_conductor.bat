@echo off
cd /d C:\science\brain
set "PYTHONUTF8=1"
set "TRANSFORMERS_OFFLINE=1"
C:\science\.venv\Scripts\python1.exe -u train_conductor_brain.py conductor-data.jsonl SmolLM2-360M-Instruct > conductor_train.log 2>&1
echo TRAIN_DONE_%errorlevel% >> conductor_train.log
