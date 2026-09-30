@echo off
title CHOP local preview
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0preview.ps1"
pause
