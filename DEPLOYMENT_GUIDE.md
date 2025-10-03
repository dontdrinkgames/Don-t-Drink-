# 🚀 Deployment Guide - Don't Drink!

## Quick Answer: How to Deploy

You have **3 options** for deployment, ranked from easiest to most control:

1. **Render** (Recommended) - Free, automatic, takes 5 minutes
2. **Railway** - Similar to Render, also free tier
3. **Your Own Server** - Full control, requires VPS

---

## 🎯 Option 1: Deploy to Render (RECOMMENDED)

### Why Render?
- ✅ Free tier available
- ✅ Automatic deployments from GitHub
- ✅ SSL certificate included
- ✅ Easy to use
- ✅ Good for Socket.IO apps

### Step-by-Step Instructions

#### **1. Prepare Your Code for GitHub**

First, we need to push your code to GitHub:

```bash
# Navigate to your project
cd /workspace

# Initialize git (if not already done)
git init

# Add all files
git add .

# Commit
git commit -m "Initial commit - Don't Drink! party game"

# Create a new repository on GitHub:
# Go to https://github.com/new
# Repository name: dont-drink-game
# Make it Public or Private (your choice)
# DO NOT initialize with README (we already have one)
# Click "Create repository"

# Connect your local repo to GitHub (replace with YOUR username)
git remote add origin https://github.com/YOUR-USERNAME/dont-drink-game.git

# Push to GitHub
git branch -M main
git push -u origin main
```

#### **2. Create Render Account**

1. Go to https://render.com
2. Click "Get Started" or "Sign Up"
3. **Sign up with GitHub** (easiest option)
4. Authorize Render to access your GitHub

#### **3. Create New Web Service**

1. Once logged in, click **"New +"** button (top right)
2. Select **"Web Service"**
3. Click **"Connect repository"** next to your `dont-drink-game` repo
   - If you don't see it, click "Configure account" to grant access
4. Fill in the details:

   ```
   Name: dont-drink-game (or any name you want)
   Region: Choose closest to you
   Branch: main
   Root Directory: (leave blank)
   Runtime: Node
   Build Command: npm install
   Start Command: npm start
   ```

5. Select **Free** plan (or paid if you want better performance)
6. Click **"Create Web Service"**

#### **4. Wait for Deployment**

- Render will now build and deploy your app
- This takes 2-5 minutes
- You'll see logs in real-time
- Look for: `✅ Questions database loaded` and `DON'T DRINK! SERVER RUNNING`

#### **5. Your App is Live! 🎉**

Once deployed, you'll get a URL like:
```
https://dont-drink-game-abcd.onrender.com
```

**That's it!** Your game is now live on the internet.

### Testing Your Deployed App

1. **Open the URL** in your browser
2. **Host a game** at `https://your-app.onrender.com/host`
3. **Join on mobile** by scanning QR or going to the room code URL
4. **Play!**

### Important Notes for Render

⚠️ **Free Tier Limitations:**
- App "sleeps" after 15 minutes of inactivity
- First request after sleep takes ~30 seconds to wake up
- Solution: Just wait patiently on the loading screen
- Or upgrade to paid plan ($7/month) for always-on

✅ **Benefits:**
- Automatic deployments when you push to GitHub
- Free SSL certificate (https://)
- Good performance for Socket.IO
- Easy to manage

---

## 🎯 Option 2: Deploy to Railway

### Why Railway?
- ✅ Also free tier
- ✅ Similar to Render
- ✅ Good performance
- ✅ Nice dashboard

### Step-by-Step

1. **Push to GitHub** (same as Render above)

2. **Create Railway Account**
   - Go to https://railway.app
   - Sign up with GitHub

3. **Create New Project**
   - Click "New Project"
   - Select "Deploy from GitHub repo"
   - Choose your `dont-drink-game` repo
   - Railway auto-detects Node.js

4. **Configure (if needed)**
   - Railway usually auto-configures everything
   - It reads your `package.json` start script

5. **Get Your URL**
   - Click "Settings" tab
   - Under "Domains", click "Generate Domain"
   - You'll get something like: `https://dont-drink-game-production.up.railway.app`

6. **Done!** Your app is live.

---

## 🎯 Option 3: Your Own Server (VPS)

### Requirements
- A VPS (Digital Ocean, Linode, AWS EC2, etc.)
- SSH access
- Node.js installed on server

### Step-by-Step

#### **1. Get a VPS**
Choose one:
- **DigitalOcean** - $4/month droplet
- **Linode** - $5/month
- **AWS EC2** - Free tier available
- **Hetzner** - Cheap European servers

#### **2. SSH into Your Server**
```bash
ssh root@your-server-ip
```

#### **3. Install Node.js**
```bash
# Update system
apt update && apt upgrade -y

# Install Node.js (using NodeSource)
curl -fsSL https://deb.nodesource.com/setup_18.x | bash -
apt install -y nodejs

# Verify
node --version  # Should show v18.x or higher
npm --version
```

#### **4. Install PM2 (Process Manager)**
```bash
npm install -g pm2
```

#### **5. Clone Your Code**
```bash
# Install git if needed
apt install -y git

# Clone your repo
cd /var/www
git clone https://github.com/YOUR-USERNAME/dont-drink-game.git
cd dont-drink-game

# Install dependencies
npm install
```

#### **6. Start with PM2**
```bash
pm2 start server.js --name dont-drink
pm2 startup  # Makes it auto-start on reboot
pm2 save
```

#### **7. Set Up Nginx (Reverse Proxy)**
```bash
# Install Nginx
apt install -y nginx

# Create config
nano /etc/nginx/sites-available/dont-drink
```

Paste this config:
```nginx
server {
    listen 80;
    server_name your-domain.com;  # Or use server IP

    location / {
        proxy_pass http://localhost:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_cache_bypass $http_upgrade;
        
        # Important for Socket.IO
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    }
}
```

```bash
# Enable site
ln -s /etc/nginx/sites-available/dont-drink /etc/nginx/sites-enabled/
nginx -t  # Test config
systemctl restart nginx
```

#### **8. (Optional) Add SSL with Let's Encrypt**
```bash
apt install -y certbot python3-certbot-nginx
certbot --nginx -d your-domain.com
```

#### **9. Done!**
Visit `http://your-domain.com` or `http://your-server-ip`

---

## 📱 Testing After Deployment

### 1. **Open Your Live URL**
```
https://your-app.onrender.com
```

### 2. **Create a Room as Host**
- Click "Host a Game"
- Note the room code (e.g., "ABC123")

### 3. **Join on Mobile**
Open your phone and go to:
```
https://your-app.onrender.com/ABC123
```

### 4. **Start Playing!**
- Select game, mode, intensity
- Click "Start Game"
- Enjoy your deployed party game!

---

## 🐛 Troubleshooting

### Issue: "Cannot connect to server"

**Solution for Render/Railway:**
```javascript
// In mobile.html, the code should detect the correct URL:
const socketUrl = window.location.origin;  // This is correct
```
This is already implemented in your code!

### Issue: "App is slow to load"

**Render Free Tier:**
- First load after sleep takes 30 seconds
- Just wait patiently
- Subsequent loads are instant

**Solution:** Upgrade to paid plan or use Railway

### Issue: "Socket.IO won't connect"

**Check:**
1. Server is running (check Render logs)
2. No browser console errors
3. Firewall not blocking WebSocket

**Fix:** The code already handles this with fallback to polling

### Issue: "QR code doesn't work"

**Make sure:**
- Using the deployed URL (not localhost)
- QR code library loaded (already in code)
- Mobile has internet connection

---

## 🔧 Environment Variables (Optional)

If you want to customize, you can add these in Render/Railway dashboard:

```bash
PORT=3000           # Usually auto-set by platform
NODE_ENV=production # Good practice
```

Your app works without any env variables though!

---

## 🎯 Recommended: Render Free Tier

### Why?
- ✅ Easiest setup (5 minutes)
- ✅ Free forever
- ✅ Auto-deploys from GitHub
- ✅ SSL included
- ✅ Good enough for parties

### Limitations?
- App sleeps after 15 min inactivity
- Takes 30 sec to wake up
- 750 hours/month free (plenty for parties!)

### Perfect For:
- Testing with friends
- Occasional party use
- Showing to people
- Portfolio projects

---

## 🚀 Next Steps After Deployment

1. **Share Your Link!**
   ```
   Hey! Join my party game:
   https://your-app.onrender.com
   ```

2. **Test Thoroughly**
   - Follow TEST_INSTRUCTIONS.md
   - Try all game modes
   - Test with real players

3. **Share the Room Code**
   - At parties, project the host screen
   - Share QR code or room code
   - Everyone joins on phones

4. **Have Fun!** 🎉

---

## 💰 Cost Comparison

| Platform | Free Tier | Paid Tier | Best For |
|----------|-----------|-----------|----------|
| **Render** | ✅ Yes, 750hrs/mo | $7/mo always-on | Easy deployment |
| **Railway** | ✅ Yes, $5 credit/mo | $5/mo | Similar to Render |
| **DigitalOcean** | ❌ No | $4/mo | Full control |
| **Vercel** | ✅ Yes | Free (but Socket.IO tricky) | Static sites mainly |
| **Heroku** | ❌ Removed free tier | $7/mo | Previously popular |

**My Recommendation:** Start with **Render Free**, upgrade if you use it a lot.

---

## 📋 Quick Deployment Checklist

```
[ ] Code pushed to GitHub
[ ] Render account created
[ ] Web Service created from GitHub repo
[ ] Build command set: npm install
[ ] Start command set: npm start
[ ] Deployment successful
[ ] Visited deployed URL
[ ] Tested creating a room
[ ] Tested joining on mobile
[ ] Played a full game
[ ] Shared with friends! 🎉
```

---

## 🆘 Need Help?

### Check These First:
1. **Render Logs** - Shows server output, errors
2. **Browser Console** - Press F12, check Console tab
3. **TEST_INSTRUCTIONS.md** - Comprehensive testing guide

### Common Questions:

**Q: How do I update my deployed app?**
A: Just push to GitHub! Render auto-deploys.
```bash
git add .
git commit -m "Update game"
git push
```

**Q: Can I use a custom domain?**
A: Yes! In Render dashboard → Settings → Custom Domains

**Q: Is my data secure?**
A: Game data only lives during the session. No storage, no tracking.

**Q: How many players can join?**
A: Tested with 10+, should handle 20-30 easily on free tier

---

## 🎉 You're Ready to Deploy!

**Easiest Path (5 Minutes):**
1. Push code to GitHub
2. Sign up on Render with GitHub
3. Create Web Service from your repo
4. Wait for deployment
5. Share your link!

That's it! Your party game will be live on the internet! 🚀

---

**Pro Tip:** Deploy now, test later. The free tier is perfect for getting started, and you can always upgrade if you host lots of parties!

Good luck, and may your parties be legendary! 🎮🎉
