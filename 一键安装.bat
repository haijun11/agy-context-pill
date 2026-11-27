@echo off
setlocal
chcp 65001 >nul

set "SRC=%~dp0"
set "DEST=%USERPROFILE%\.gemini\config\plugins\context-pill"
set "CFG=%USERPROFILE%\.gemini\config\config.json"

echo [1/2] Installing context-pill to "%DEST%" ...
if not exist "%DEST%" mkdir "%DEST%"
copy /y "%SRC%plugin.json" "%DEST%\plugin.json" >nul
xcopy /e /i /y "%SRC%sidecars" "%DEST%\sidecars" >nul

echo [2/2] Enabling context-pill in config.json ...
powershell -NoProfile -Command "$p='%CFG%'; $d=Split-Path $p; if(!(Test-Path $d)){New-Item -ItemType Directory -Path $d -Force|Out-Null}; $o=[pscustomobject]@{}; if(Test-Path $p){try{$r=Get-Content $p -Raw -Encoding UTF8; if($r.Trim()){$o=$r|ConvertFrom-Json}}catch{}}; if(-not $o.PSObject.Properties['plugins'] -or $null -eq $o.plugins){$o|Add-Member -NotePropertyName plugins -NotePropertyValue ([pscustomobject]@{}) -Force}; $o.plugins|Add-Member -NotePropertyName 'context-pill' -NotePropertyValue ([pscustomobject]@{enabled=$true}) -Force; $o|ConvertTo-Json -Depth 10|Set-Content -Path $p -Encoding UTF8"

echo.
echo Done! Remember to launch Antigravity with:
echo   --remote-debugging-port=0 --remote-debugging-address=127.0.0.1
pause
