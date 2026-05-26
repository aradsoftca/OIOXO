@echo off
cd /d C:\science\brain
set "PYTHONUTF8=1"
C:\science\.venv\Scripts\python1.exe -u eval_compare.py > eval_compare.log 2>&1
echo EVAL_DONE_%errorlevel% >> eval_compare.log
