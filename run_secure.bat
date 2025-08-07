@echo off
REM Secure startup script for HordeComms
REM This script allows you to set environment variables securely

echo Starting HordeComms with environment variables...
echo.

REM Check if environment variables are set
if "%DISCORD_TOKEN%"=="" (
    echo WARNING: DISCORD_TOKEN environment variable not set
    echo Please set your Discord bot token as an environment variable
    echo Example: set DISCORD_TOKEN=your_token_here
    echo.
)

if "%TELNET_PASSWORD%"=="" (
    echo WARNING: TELNET_PASSWORD environment variable not set
    echo Please set your telnet password as an environment variable
    echo Example: set TELNET_PASSWORD=your_password_here
    echo.
)

if "%TELNET_IP%"=="" (
    echo WARNING: TELNET_IP environment variable not set
    echo Please set your server IP as an environment variable
    echo Example: set TELNET_IP=your_server_ip_here
    echo.
)

REM Prompt user to set environment variables if needed
if "%DISCORD_TOKEN%"=="" goto :setenv
if "%TELNET_PASSWORD%"=="" goto :setenv
if "%TELNET_IP%"=="" goto :setenv

REM All environment variables are set, start the bot
echo All required environment variables are set. Starting bot...
echo.
node index.js
goto :end

:setenv
echo.
echo You can set environment variables in several ways:
echo 1. Command line: set DISCORD_TOKEN=your_token_here
echo 2. System environment variables (Control Panel)
echo 3. Create a .env.bat file with your credentials
echo.
echo Example .env.bat file:
echo set DISCORD_TOKEN=your_token_here
echo set TELNET_PASSWORD=your_password_here
echo set TELNET_IP=your_server_ip_here
echo set TELNET_PORT=8081
echo set DISCORD_CHANNEL=your_channel_id_here
echo call run_secure.bat
echo.
pause

:end
