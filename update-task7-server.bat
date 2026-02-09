@echo off
echo Uploading updated server.js to EC2...
scp -i ExamForNewCandidates.pem lab\src\server.js ubuntu@34.244.246.180:~/server.js
echo.
echo Copying to container and restarting...
ssh -i ExamForNewCandidates.pem ubuntu@34.244.246.180 "docker cp ~/server.js users-app:/app/lab/src/server.js && docker restart users-app && echo 'Container restarted successfully!'"
echo.
echo Task 7 should now be visible!
echo Please refresh your browser.
pause
