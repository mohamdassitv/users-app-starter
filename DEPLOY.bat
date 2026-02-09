@echo off
REM Quick Deployment to New EC2 Instance
REM Instance: i-0fc5a91af937f1212
REM ========================================

echo.
echo =========================================
echo   Quick Deploy to New EC2 Instance
echo   Instance: i-0fc5a91af937f1212
echo   IP: 34.255.197.158
echo =========================================
echo.
echo This will deploy your application to the new EC2 instance.
echo.
echo Press any key to continue or Ctrl+C to cancel...
pause >nul

powershell.exe -ExecutionPolicy Bypass -File "deploy-new-ec2.ps1"

echo.
echo =========================================
echo   Deployment Complete!
echo =========================================
echo.
pause
