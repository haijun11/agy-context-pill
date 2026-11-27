@echo off
setlocal
chcp 65001 >nul

set "DEST=%USERPROFILE%\.gemini\config\plugins\context-pill"
set "CFG=%USERPROFILE%\.gemini\config\config.json"

echo [1/2] Removing context-pill from config.json ...
powershell -NoProfile -Command "$p='%CFG%'; if(Test-Path $p){try{$o=Get-Content $p -Raw -Encoding UTF8|ConvertFrom-Json; if($o.plugins -and $o.plugins.PSObject.Properties['context-pill']){$o.plugins.PSObject.Properties.Remove('context-pill'); $o|ConvertTo-Json -Depth 10|Set-Content -Path $p -Encoding UTF8}}catch{}}"

echo [2/2] Deleting "%DEST%" ...
if exist "%DEST%" rmdir /s /q "%DEST%"

echo.
echo Uninstalled! Restart Antigravity to finish cleanup.
pause
