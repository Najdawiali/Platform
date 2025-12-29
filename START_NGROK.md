# 🚀 Quick Start Guide - Share Your App with ngrok

## Step 1: Start Backend Server

Open Terminal 1:
```bash
cd /Users/xhxa053/PycharmProjects/platform/data-platform/backend
source ./venv-platform/bin/activate
python -m uvicorn app.main:app --host 0.0.0.0 --port 8000
```

Keep this terminal running! ✅

---

## Step 2: Start ngrok Tunnel

Open Terminal 2:
```bash
ngrok http 8000
```

You'll see output like:
```
Session Status                online
Account                       [your email]
Version                       3.x.x
Region                        United States (us)
Forwarding                    https://abc-123-xyz.ngrok-free.app -> http://localhost:8000
```

**Copy the HTTPS URL** (e.g., `https://abc-123-xyz.ngrok-free.app`)

Keep this terminal running too! ✅

---

## Step 3: Start Frontend (Local)

Open Terminal 3:
```bash
cd /Users/xhxa053/PycharmProjects/platform/data-platform/frontend

# Update API URL to use ngrok (replace with YOUR ngrok URL)
echo "VITE_API_URL=https://abc-123-xyz.ngrok-free.app" > .env.local

npm run dev
```

Frontend runs at: http://localhost:5173

---

## Step 4: Share with Your Brother

### Option A: He accesses backend directly
Send him the **ngrok URL**: `https://abc-123-xyz.ngrok-free.app`

He can:
- Use API docs: `https://abc-123-xyz.ngrok-free.app/docs`
- Test endpoints with Postman/curl
- Build his own frontend

### Option B: He accesses your full app (RECOMMENDED)

You need to share your frontend too. Two ways:

**Easy Way - ngrok for frontend too:**
```bash
# Terminal 4
ngrok http 5173
```

Send him BOTH URLs:
- Frontend: `https://def-456-xyz.ngrok-free.app` (from Terminal 4)
- Backend: `https://abc-123-xyz.ngrok-free.app` (from Terminal 2)

**Better Way - Deploy frontend to Vercel (free, 2 minutes):**
```bash
cd frontend
npm install -g vercel
vercel login
vercel --prod
```

Then set environment variable on Vercel:
- Key: `VITE_API_URL`
- Value: Your ngrok backend URL

---

## Important Notes

### ⚠️ Your Computer Must Stay On
- ngrok only works while your computer is running
- If you close laptop or sleep, connection dies

### 🔄 URL Changes Each Restart
- Free ngrok URLs change every time you restart
- Send new URL to your brother each time
- **Upgrade to ngrok Pro** ($10/month) for permanent URL

### 📊 Monitor Traffic
- ngrok shows all requests in Terminal 2
- Web interface: http://localhost:4040
- See what your brother is testing in real-time!

### 🛡️ Security
- First-time visitors see ngrok warning page (click "Visit Site")
- Free tier has rate limits
- Don't share URL publicly (just with your brother)

---

## Quick Commands Summary

### Start Everything:
```bash
# Terminal 1 - Backend
cd backend && source ./venv-platform/bin/activate && python -m uvicorn app.main:app --host 0.0.0.0 --port 8000

# Terminal 2 - ngrok for Backend
ngrok http 8000

# Terminal 3 - Frontend
cd frontend && npm run dev

# Terminal 4 (optional) - ngrok for Frontend
ngrok http 5173
```

### Stop Everything:
Press `Ctrl+C` in each terminal

---

## Troubleshooting

### "ERR_NGROK_3200" or auth errors
```bash
# Sign up for free ngrok account
ngrok config add-authtoken YOUR_AUTH_TOKEN
```

Get your token from: https://dashboard.ngrok.com/get-started/your-authtoken

### CORS errors in browser
- Make sure backend CORS allows "*"
- Check ngrok URL is HTTPS (not HTTP)

### Connection refused
- Verify backend is running on port 8000
- Check firewall isn't blocking

### Frontend can't reach backend
- Update `frontend/.env.local` with correct ngrok URL
- Restart frontend after changing .env.local

---

## Next Session Workflow

Every time you restart:

1. Start backend (Terminal 1)
2. Start ngrok (Terminal 2) - **URL will be different!**
3. Copy new ngrok URL
4. Update `frontend/.env.local` with new URL
5. Start frontend (Terminal 3)
6. Send new ngrok URL to your brother

---

## Upgrade Options

If you need more:
- **Permanent URL**: ngrok Pro ($10/month)
- **No warning page**: ngrok Pro
- **Multiple tunnels**: ngrok Pro
- **24/7 access without your computer**: Deploy to Render.com instead
