@echo off
:: ASCII-only wrapper — just launches PowerShell with the .ps1 script
:: (Korean-text cmd files break due to CP949 vs UTF-8 encoding mismatch)

set "PS_SCRIPT=%~dp0ASSI-Keynote-변환.ps1"
if not exist "%PS_SCRIPT%" set "PS_SCRIPT=C:\assi-proto\desktop\scripts\ASSI-Keynote-변환.ps1"

powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%PS_SCRIPT%" -KeyPath "%~1"
