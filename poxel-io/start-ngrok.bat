@echo off
setlocal
cd /d "%~dp0"

where ngrok >nul 2>&1
if errorlevel 1 (
	echo ngrok was not found on PATH.
	echo Install ngrok, then run this file again.
	pause
	exit /b 1
)

if not exist node_modules\ws (
	echo Installing server dependencies...
	call npm.cmd install
	if errorlevel 1 (
		echo npm install failed.
		pause
		exit /b 1
	)
)

echo Starting Poxel.io server on port 3000...
start "Poxel.io server" /D "%~dp0" cmd /k npm.cmd start

echo Waiting for the server to become ready...
for /l %%i in (1,1,30) do (
	curl.exe --silent --fail http://127.0.0.1:3000/health >nul 2>&1
	if not errorlevel 1 goto server_ready
	ping.exe 127.0.0.1 -n 2 >nul
)

echo The Poxel.io server did not become ready on port 3000.
pause
exit /b 1

:server_ready
echo Server is ready. Starting ngrok...
ngrok http 3000
pause
