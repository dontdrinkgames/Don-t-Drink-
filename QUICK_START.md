# ⚡ QUICK START - 3 Easy Steps

## 🎯 What You Need to Do Right Now

### Step 1: Test Locally (2 minutes)

```bash
# In your terminal, run:
npm start
```

Then open your browser:
```
http://localhost:3000
```

**Expected:** You should see the purple gradient landing page!

---

### Step 2: Deploy to Internet (5 minutes)

#### A) Push to GitHub

```bash
# Create a new repo on GitHub.com:
# 1. Go to https://github.com/new
# 2. Name it: dont-drink-game
# 3. Don't initialize with anything
# 4. Click "Create repository"

# Then in your terminal:
git init
git add .
git commit -m "Initial commit"
git remote add origin https://github.com/YOUR-USERNAME/dont-drink-game.git
git branch -M main
git push -u origin main
```

#### B) Deploy on Render

```bash
# 1. Go to https://render.com
# 2. Click "Sign Up" and use your GitHub account
# 3. Click "New +" → "Web Service"
# 4. Connect your dont-drink-game repository
# 5. Fill in:
#    - Name: dont-drink-game
#    - Build Command: npm install
#    - Start Command: npm start
# 6. Click "Create Web Service"
# 7. Wait 2-3 minutes
```

**You'll get a URL like:** `https://dont-drink-game-xyz.onrender.com`

---

### Step 3: Play! (1 minute)

#### On Desktop (Host):
1. Go to your deployed URL + `/host`
   ```
   https://dont-drink-game-xyz.onrender.com/host
   ```
2. You'll get a room code like: **ABC123**
3. Select game, mode, intensity
4. Wait for players

#### On Mobile (Players):
1. Go to the URL + your room code:
   ```
   https://dont-drink-game-xyz.onrender.com/ABC123
   ```
2. Enter name, pick emoji avatar
3. Click "Join Game"
4. Wait for host to start

#### Start Playing:
1. Host clicks "Start Game"
2. Questions appear
3. Players interact based on mode
4. Have fun! 🎉

---

## 🎮 What to Test

Try these combinations:

1. **Never Have I Ever + Mobile Voting + Medium**
   - Questions appear
   - Players vote on phones
   - See live results

2. **Would You Rather + Spotlight + Spicy**
   - One player in spotlight
   - They answer privately
   - Then reveal to everyone

3. **Hot Takes + Mixmaster + Cancelled**
   - Modes rotate automatically
   - Controversial statements
   - Maximum chaos!

---

## 📱 Share With Friends

Once deployed, share:
```
🎮 Let's play Don't Drink!

1. Go to: https://your-app.onrender.com
2. Enter room code: ABC123
3. Join the chaos!
```

Or just show them the QR code from the host screen!

---

## 🐛 Something Wrong?

### Server won't start?
```bash
# Make sure dependencies are installed:
npm install

# Try again:
npm start
```

### Can't connect on mobile?
- Make sure using deployed URL (not localhost)
- Check room code is correct (6 characters)
- Wait 30 seconds if on Render free tier (app wakes up)

### Socket.IO not working?
- Check browser console (F12)
- Look for "Connected to server" message
- If not, refresh the page

---

## 🎯 That's It!

You now have:
- ✅ A working party game
- ✅ Deployed on the internet
- ✅ Ready for real players

**Next:** Read DEPLOYMENT_GUIDE.md for details or TEST_INSTRUCTIONS.md for thorough testing.

**Now:** Invite friends and party! 🎉🍻

---

## 💡 Pro Tips

1. **First deployment takes time:** Render free tier sleeps. First load = 30 sec wait. Be patient!

2. **Test before party:** Try all modes to see which you like

3. **Cancelled mode is WILD:** Make sure your friends are ready for it!

4. **Custom questions:** Use `/add-question/ROOMCODE` to let people submit anonymously

5. **Mobile matters:** The magic is everyone on their phones voting/answering

---

## 🚀 You're Ready!

The hard part is done. Now just:
1. Deploy (5 min)
2. Test (10 min)
3. Party! (all night 🎊)

Have fun! 🎮
