# Pi Connect Backend Setup

## Quick Start (Local Development)

### 1. Install Dependencies
```bash
cd server
npm install
```

### 2. Configure Environment
```bash
cp .env.example .env
```

Edit `.env` and add:
```
PORT=3001
NODE_ENV=development
FRONTEND_URL=http://localhost:3000
MONGODB_URI=mongodb://localhost:27017/pi-connect
PI_API_KEY=your_key_here
JWT_SECRET=your_secret_here
```

### 3. Start Server
```bash
npm run dev
```

Server runs on `http://localhost:3001`

---

## What You Need to Do (Step-by-Step)

### Step 1: Get Pi Network Credentials
1. Go to https://developers.minepi.com
2. Register your app
3. Get `PI_API_KEY` and `PI_WALLET_PRIVATE_KEY`
4. Add to backend `.env`

### Step 2: Set Up Database
Choose one:

**Option A: MongoDB Atlas (Cloud)**
- Go to https://www.mongodb.com/cloud/atlas
- Create free cluster
- Create database user
- Get connection string
- Add to `.env` as `MONGODB_URI`

**Option B: Local MongoDB**
- Install MongoDB locally
- Run: `mongod`
- Use `mongodb://localhost:27017/pi-connect`

### Step 3: Configure Frontend
Update `/app/.env.production`:
```
REACT_APP_API_URL=http://localhost:3001
REACT_APP_WS_URL=ws://localhost:3001
```

### Step 4: Test Connection
In your app:
1. Log in with Pi SDK
2. Go to Developer Tools (F12)
3. Check Console for connection messages
4. Should see: "WebSocket connected"

### Step 5: Deploy (When Ready)

Choose platform from DEPLOYMENT_GUIDE.md and follow steps.

---

## Backend Architecture

```
/server
  ├── server.js          # Main Express app + Socket.io
  ├── package.json       # Dependencies
  ├── .env              # Environment variables
  └── .env.example      # Template
```

### Key Features Implemented

✅ Express.js REST API
✅ Socket.io WebSocket server
✅ User authentication via Pi SDK
✅ Real-time messaging
✅ Status updates
✅ WebRTC signaling
✅ CORS configuration
✅ Error handling

### What's Next (When Scaling)

Add to server:
- [ ] MongoDB integration (replace in-memory storage)
- [ ] JWT token validation
- [ ] File upload handler
- [ ] Message persistence
- [ ] Group chat support
- [ ] Email service
- [ ] Redis for caching
- [ ] Rate limiting
- [ ] Logging service
- [ ] Monitoring/alerts

---

## Environment Variables Explained

| Variable | Purpose | Example |
|----------|---------|---------|
| PORT | Server port | 3001 |
| NODE_ENV | Environment | development/production |
| FRONTEND_URL | For CORS | http://localhost:3000 |
| MONGODB_URI | Database | mongodb+srv://user:pass@cluster.mongodb.net/db |
| PI_API_KEY | Pi Network auth | sk_xxx... |
| PI_WALLET_PRIVATE_KEY | Pi payments | 0x... |
| JWT_SECRET | Token signing | random_string |

---

## Common Issues & Solutions

### "Cannot find module 'express'"
```bash
npm install
```

### "WebSocket connection refused"
- Frontend URL in server `.env` must match where frontend is running
- Add `http://localhost:3000` to `FRONTEND_URL`

### "MongoDB connection failed"
- Check MongoDB is running
- Verify connection string in `.env`
- Test with MongoDB Compass

### CORS errors
- Check `FRONTEND_URL` in server `.env`
- Should be exact match: `http://localhost:3000` not `http://localhost:3000/`

### Messages not sending
- Check WebSocket shows "connected" in Console
- Verify both Frontend and Backend are running
- Check browser Console for errors

---

## Next Steps

1. ✅ Backend code ready
2. 👉 Set up `.env` with your credentials
3. 👉 Test locally with `npm run dev`
4. 👉 Deploy to Vercel/Railway/Render
5. 👉 Update frontend env variables
6. 👉 Deploy frontend
7. 👉 Test on production URL

You're in control—I've given you the complete backend code. You just need to configure and deploy!
