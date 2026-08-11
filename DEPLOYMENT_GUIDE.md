# Pi Connect Deployment Guide

## Step 1: Prepare Your Backend

### Local Development
```bash
cd server
npm install
cp .env.example .env
# Edit .env with your values
npm run dev
```

## Step 2: Choose Your Hosting Platform

### Option A: Vercel (Recommended for Beginners)
1. Push code to GitHub
2. Connect GitHub to Vercel
3. Set environment variables in Vercel dashboard
4. Deploy automatically on push

**Pros:** Free tier, easy setup, auto-scaling  
**Cons:** Limited to 10s timeout for API calls

### Option B: Railway.app (Best Overall)
1. Push code to GitHub
2. Connect to Railway.app
3. Create PostgreSQL/MongoDB plugin
4. Set environment variables
5. Deploy with one click

**Pros:** Generous free tier, great for full-stack  
**Cons:** Requires credit card

### Option C: Render.com (Good Alternative)
1. Connect GitHub repo
2. Create Web Service
3. Add environment variables
4. Deploy from main branch

**Pros:** Good free tier, simple interface  
**Cons:** Spins down on inactivity

### Option D: DigitalOcean App Platform
1. Push to GitHub
2. Connect DigitalOcean App
3. Configure as Node.js service
4. Add environment variables

**Pros:** $5-12/month, always on, good support  
**Cons:** Requires payment

## Step 3: Set Up Database

### MongoDB Atlas (Free)
1. Go to https://www.mongodb.com/cloud/atlas
2. Create free cluster
3. Create database user
4. Get connection string
5. Add to `.env` as `MONGODB_URI`

### PostgreSQL (on your hosting platform)
- Most platforms offer free PostgreSQL tier
- Just add as plugin during setup

## Step 4: Configure Pi Network

1. Register app at https://developers.minepi.com
2. Get `PI_API_KEY` and `PI_WALLET_PRIVATE_KEY`
3. Add to your hosting platform's environment variables
4. Update your frontend `.env` with backend URL:
   ```
   REACT_APP_API_URL=https://your-backend.vercel.app
   REACT_APP_WS_URL=wss://your-backend.vercel.app
   ```

## Step 5: Update Frontend

In your frontend `.env.production`:
```
REACT_APP_API_URL=https://your-deployed-backend-url.com
REACT_APP_WS_URL=wss://your-deployed-backend-url.com
```

## Step 6: Deploy Frontend

### Using Vercel (Easiest)
```bash
npm install -g vercel
vercel --prod
```

### Using Netlify
1. Connect GitHub to Netlify
2. Set build command: `npm run build`
3. Set publish directory: `dist`
4. Add environment variables
5. Auto-deploys on push

## Step 7: Test Deployment

1. Go to your frontend URL
2. Log in with Pi SDK
3. Create a test contact
4. Send a test message
5. Check backend logs for errors

## Step 8: Set Up Custom Domain (Optional)

### Using Vercel/Netlify Domain Settings:
1. Go to project settings
2. Add domain
3. Update DNS records (usually automatic)
4. Wait 24-48 hours for DNS propagation

## Troubleshooting

### Backend not connecting
- Check CORS origin in `.env` matches frontend URL
- Verify all environment variables are set
- Check backend logs for errors

### WebSocket not working
- Ensure backend supports WebSocket upgrades
- Check firewall isn't blocking port 3001
- Verify `FRONTEND_URL` is correct

### Database connection fails
- Test connection string in MongoDB Compass
- Verify IP whitelist in MongoDB Atlas
- Check credentials in `.env`

### Messages not saving
- Ensure database is connected
- Check MongoDB collection exists
- Verify file permissions on server

## Production Checklist

- [ ] Database backup strategy
- [ ] Error logging (Sentry, LogRocket)
- [ ] Monitoring (Datadog, New Relic)
- [ ] SSL certificate (auto with Vercel/Railway)
- [ ] Rate limiting enabled
- [ ] CORS properly configured
- [ ] JWT secrets rotated
- [ ] File upload size limits set
- [ ] Pi SDK credentials secured
- [ ] Database indexes created

## Scaling Later

When you grow:
1. Add caching layer (Redis)
2. Set up CDN for file uploads
3. Implement job queue (Bull, RabbitMQ)
4. Scale database (read replicas)
5. Add load balancer (Kong, nginx)
