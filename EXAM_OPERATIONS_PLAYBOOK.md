# 📋 Exam Operations Playbook

## Quick Access Links
- **Admin Panel**: http://ec2-46-137-137-170.eu-west-1.compute.amazonaws.com:8081/admin.html
- **Manager Panel**: http://ec2-46-137-137-170.eu-west-1.compute.amazonaws.com:8081/manager.html
- **Candidate Login**: http://ec2-46-137-137-170.eu-west-1.compute.amazonaws.com:8081/login.html

---

## 🔐 Login Credentials

### Admin Login (for all staff)
- **URL**: `/admin-login.html`
- **Username**: Your checkpoint email (e.g., `lihias` or `lihias@checkpoint.com`)
- **Password**: `2025`

### Manager Login (Nastya, Shay, Othman only)
- **URL**: `/admin-login.html` → then access `/manager.html`
- Same credentials as admin

---

## 📝 Day-to-Day Operations

### 1. Create a New Candidate

**From Admin Panel:**
1. Go to Admin Panel
2. Scroll to "Create New Candidate" section
3. Fill in:
   - **Name**: Full name
   - **Email**: Candidate's email (must be unique)
4. Click **Create Candidate**
5. Note the generated login link

### 2. Start a Candidate's Exam

**Important**: Only ONE candidate can take the exam at a time!

1. Find the candidate in the list
2. Click the green **Start** button
3. Wait for the loading animation (creates 13 Docker containers)
4. Confirm "Exam started successfully" message
5. Share the login link with the candidate

### 3. Monitor Active Exam

- **Time Remaining**: Shown in the candidate row
- **Running Status**: Green indicator = active
- Candidate answers auto-save every few seconds

### 4. Extend Exam Time

If a candidate needs more time:
1. Find the candidate row
2. Enter minutes in the "+min" input box
3. Click **Add**
4. Time will be added immediately (works even if exam expired)

### 5. Force Finish an Exam

To manually end an exam:
1. Click the **⏹️ Finish** button
2. Confirm the action
3. Exam will be marked as finished

### 6. Reset a Candidate

To let a candidate restart from scratch:
1. Click the **Reset** button
2. Confirm the action
3. This clears their start time (they can start fresh)

### 7. Delete a Candidate

To remove a candidate completely:
1. Click the red **Del** button
2. Confirm the action
3. ⚠️ This is permanent!

---

## 📊 Scoring (Manager Only)

1. Access Manager Panel
2. Find the finished candidate
3. Enter scores for each task:
   - casestudy (0-100)
   - mail (0-100)
   - users (0-100)
   - alerts (0-100)
   - routing (0-100)
   - waf (0-100)
4. Click **Save Scores**
5. Total score is calculated automatically

---

## 🚨 Troubleshooting

### Candidate Can't Login
- Verify email is spelled correctly
- Check if candidate exists in the system
- Try resetting the candidate

### Exam Shows "Another candidate is running"
- Only one exam can run at a time
- Finish or wait for the current exam to complete

### Timer Issues / Exam Closed Early
- Use the **Add** button to extend time
- This reactivates expired exams automatically

### Containers Not Starting
- Check if Docker is running on EC2
- Try the Reset button, then Start again

### Page Not Loading
- Server URL: `http://ec2-46-137-137-170.eu-west-1.compute.amazonaws.com:8081`
- If down, contact system admin

---

## 📞 Emergency Contacts

| Role | Name | Phone |
|------|------|-------|
| Manager | Nastasya Narsia | 0525090113 |
| Manager | Shay Naveh | 0523485099 |
| Manager | Othman Kharoubi | 0547586780 |

---

## ⏰ Exam Duration

- **Default Duration**: 4 hours (240 minutes)
- **Can be extended**: Yes, via Admin/Manager panel
- **Auto-save**: Every few seconds

---

## 🔄 Daily Checklist

### Before Exam Day
- [ ] Create candidate in system
- [ ] Verify candidate email is correct
- [ ] Test login link works
- [ ] Ensure no other exam is running

### During Exam
- [ ] Start the exam when candidate is ready
- [ ] Monitor time remaining
- [ ] Be available for time extensions if needed

### After Exam
- [ ] Verify exam is marked as finished
- [ ] Review candidate answers
- [ ] Enter scores (Manager only)
- [ ] Export/backup if needed

---

## 🛡️ System Maintenance (Auto)

These run automatically:
- **Docker Cleanup**: Every 4 hours (removes stopped containers)
- **Daily Backup**: 2 AM (backs up all submissions)
- **Submissions**: Never deleted, stored persistently

---

## 📁 Data Locations (For Tech Support)

| Data | Location |
|------|----------|
| State/Candidates | `/home/ubuntu/app/lab/state/state.json` |
| Answer Files | `/home/ubuntu/app/lab/state/sessions/` |
| Backups | `/home/ubuntu/backups/` |

---

## 🔑 Staff Directory

### Managers (Full Access)
- nastasyan@checkpoint.com
- shayn@checkpoint.com  
- othmank@checkpoint.com

### Admin Staff (Admin Panel Only)
- lihias@checkpoint.com
- nitaid@checkpoint.com
- ileel@checkpoint.com
- ahmedh@checkpoint.com
- ayhamg@checkpoint.com
- benjaminsa@checkpoint.com
- davidel@checkpoint.com
- guyreg@checkpoint.com
- mohamadasi@checkpoint.com
- mousab@checkpoint.com
- slimana@checkpoint.com
- yanasi@checkpoint.com

---

*Last Updated: January 29, 2026*
