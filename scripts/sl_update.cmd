@echo off
rem Task Scheduler entry point: paths resolve relative to this file.
"%~dp0..\.venv\Scripts\python.exe" "%~dp0sl_update.py" >> "%~dp0..\data\raw\sl\update.log" 2>&1
