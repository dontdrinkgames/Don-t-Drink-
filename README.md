# 🎮 DON'T DRINK! - The Ultimate Party Game Platform

<div align="center">

![Don't Drink! Logo](public/dontdrinklogo.png)

**The ultimate real-time party game platform for adults (18+)**

*Chaos • Laughter • Unforgettable Nights*

[![Node.js](https://img.shields.io/badge/Node.js-18+-green.svg)](https://nodejs.org/)
[![Socket.IO](https://img.shields.io/badge/Socket.IO-4.7.4-blue.svg)](https://socket.io/)
[![License](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)
[![Status](https://img.shields.io/badge/Status-Production%20Ready-success.svg)]()

[🎯 Features](#features) • [🚀 Quick Start](#quick-start) • [🎮 How to Play](#how-to-play) • [📚 Documentation](#documentation)

</div>

---

## 🌟 Overview

**Don't Drink!** is a web-based party game platform where one person hosts the game on a big screen (TV/laptop) while players join on their phones using room codes. Think Jackbox Games meets Cards Against Humanity, with a spicy twist!

### 🎯 What Makes It Special?

- **📱 Mobile-First**: Players use their phones as controllers
- **🌐 Real-Time**: Live gameplay powered by Socket.IO
- **🎲 4 Epic Games**: Never Have I Ever, F*ck Marry Kill, Would You Rather, Hot Takes
- **🎭 4 Play Modes**: Offline, Mobile Voting, Spotlight, and Mixmaster
- **🌶️ 3 Intensity Levels**: From Medium to Spicy to absolutely Cancelled
- **💬 1000+ Questions**: Curated content across all games and intensities
- **✨ Custom Questions**: Players can submit anonymous questions mid-game
- **🎨 Gorgeous Design**: Purple gradient paradise with 3D card effects

---

## ✨ Features

### 🎮 Four Wicked Games

| Game | Description | Example |
|------|-------------|---------|
| **Never Have I Ever** | Classic drinking game confessions | "Never have I ever kissed a stranger" |
| **F*ck, Marry, Kill** | The ultimate choice dilemma | "Chris Evans, Chris Pratt, Chris Pine" |
| **Would You Rather** | Impossible decisions | "Have unlimited money or unlimited time?" |
| **Hot Takes** | Controversial opinion battles | "Pineapple belongs on pizza" |

### 📱 Four Play Modes

1. **Offline Mode** 📺
   - Classic pass-and-play
   - Questions on the big screen
   - Perfect for intimate groups

2. **Mobile Voting** 🗳️
   - Everyone votes on their phone
   - Live results on the host screen
   - Democratic chaos!

3. **Spotlight Mode** 🎯
   - One player in the hot seat
   - Private answers, public reveals
   - Maximum drama and tension
   - **Everyone sees WHO is in spotlight, but not WHAT they choose until they reveal!**

4. **Mixmaster Mode** 🎲
   - Automatically rotates between modes
   - Keeps everyone on their toes
   - Ultimate variety

### 🌶️ Three Intensity Levels

- **Medium (😊)**: Safe for work, fun for everyone
- **Spicy (🌶️)**: Adult content, things heat up
- **Cancelled (☠️)**: No boundaries, absolutely unfiltered

---

## 🚀 Quick Start

### Prerequisites
- Node.js 18+ installed
- Modern web browser
- (Optional) Mobile devices for multiplayer

### Installation

```bash
# Clone the repository
git clone https://github.com/yourusername/dont-drink-game.git
cd dont-drink-game

# Install dependencies
npm install

# Start the server
npm start
```

The server will start on `http://localhost:3000`

### 🎯 First Game

1. **Host Setup:**
   - Navigate to `http://localhost:3000`
   - Click "🎮 Host a Game"
   - Note your room code (e.g., "ABC123")

2. **Players Join:**
   - Scan the QR code with your phone, OR
   - Go to `http://localhost:3000/ABC123` (replace with your room code)
   - Enter your name and choose an avatar
   - Click "Join Game"

3. **Configure Game:**
   - Select a game (e.g., "Never Have I Ever")
   - Select a mode (e.g., "Mobile Voting")
   - Select intensity (e.g., "Spicy")
   - Click "Start Game"

4. **Play!**
   - Questions appear on both screens
   - Players interact via mobile
   - Host clicks "Next Question" to continue

---

## 🎮 How to Play

### 📺 For Hosts

1. **Create Room**: Visit `/host` to generate a room code
2. **Share Access**: Show QR code or share room code with players
3. **Configure**: Select game type, mode, and intensity
4. **Start**: Click "Start Game" when everyone's ready
5. **Control**: Navigate questions with "Next Question" button

### 📱 For Players

1. **Join**: Scan QR or enter room code in browser
2. **Personalize**: Choose name and avatar
3. **Wait**: Chill on waiting screen until host starts
4. **Play**: Follow prompts on your phone based on game mode

---

## 🎯 Game Mode Details

### Offline Mode
- Questions appear on host screen only
- Players respond verbally or physically
- Great for small, close-knit groups
- No phone interaction needed

### Mobile Voting Mode
- Questions on all screens
- Players vote via phone buttons
- Live results with percentages on host screen
- Majority rules or just for fun!

**Example Buttons:**
- NHIE: "I HAVE" / "I HAVE NEVER"
- Hot Takes: "AGREE" / "DISAGREE"
- WYR: "OPTION A" / "OPTION B"

### Spotlight Mode
**This is where it gets intense!**

1. Question appears on all screens
2. One player gets the spotlight (everyone sees WHO)
3. Spotlight player answers privately on their phone
4. Others see "Thinking..." status (they know WHO, not WHAT)
5. Spotlight player hits "REVEAL ANSWER"
6. Answer appears on all screens simultaneously
7. Spotlight rotates to next player

**Privacy Promise:** No one sees your answer until YOU choose to reveal it!

### Mixmaster Mode
- Automatically cycles through all modes
- Pattern: Offline → Mobile → Spotlight → Offline...
- Keeps the game fresh and unpredictable
- Perfect for long sessions

---

## 🏗️ Technical Architecture

### Stack
- **Backend**: Node.js + Express.js
- **Real-Time**: Socket.IO (WebSocket + polling)
- **Frontend**: Vanilla JavaScript (no framework!)
- **Styling**: Custom CSS with design system
- **Font**: Poppins (Google Fonts)

### File Structure
```
/workspace/
├── server.js                    # Express + Socket.IO server
├── questions-database.js        # Question management
├── package.json                 # Dependencies
└── public/
    ├── index.html              # Landing page
    ├── host.html               # Host control panel
    ├── mobile.html             # Player interface
    ├── play.html               # Game screen
    └── add-question.html       # Anonymous submissions
```

### Socket.IO Events

**Client → Server:**
- `create-room` - Create new game room
- `join-room` - Join existing room
- `start-game` - Initialize game
- `next-question` - Request new question
- `vote` - Submit player vote
- `spotlight-answer` - Private spotlight answer
- `reveal-answer` - Reveal spotlight answer

**Server → Client:**
- `room-created` - Room ready
- `player-joined` - New player
- `game-started` - Game begins
- `new-question` - Question distributed
- `vote-update` - Live vote counts
- `spotlight-active` - Spotlight set
- `answer-revealed` - Answer shown

---

## 🎨 Design System

### Color Palette
```css
/* Background */
background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);

/* Primary Colors */
--purple: #A855F7;
--yellow: #FACC15;
--mint: #10B981;
--pink: #F472B6;
--coral: #FB7185;
--red: #DC2626;
```

### Design Principles
- ✅ Solid colors on cards (NO gradients)
- ✅ Hard drop shadows: `filter: drop-shadow(4px 6px 0px color)`
- ✅ Rounded corners: `border-radius: 16-24px`
- ✅ Poppins font family
- ✅ Purple gradient background on all pages
- ✅ 3D card hover effects
- ✅ Mobile-first responsive design

**This design system is SACRED - never change it!**

---

## 📊 Question Database

### Statistics
- **Total Questions**: 1,031+
- **Never Have I Ever**: 500 questions
- **Would You Rather**: 600+ questions
- **Hot Takes**: 458 questions
- **F*ck Marry Kill**: 162 questions

### Breakdown by Intensity
- **Medium**: ~687 questions (safe for work)
- **Spicy**: ~562 questions (adult content)
- **Cancelled**: ~401 questions (no boundaries)

### Adding Custom Questions
1. During gameplay, navigate to `/add-question/:ROOMCODE`
2. Select game type and intensity
3. Write your question
4. Submit anonymously
5. Question appears in the first 20 questions of that game

---

## 🚀 Deployment

### Deploy to Render

1. **Prepare Repository:**
   ```bash
   git init
   git add .
   git commit -m "Initial commit"
   git remote add origin YOUR_GITHUB_REPO
   git push -u origin main
   ```

2. **Create Render Service:**
   - Go to [Render Dashboard](https://dashboard.render.com/)
   - Click "New +" → "Web Service"
   - Connect your GitHub repository
   - Configure:
     - **Name**: dont-drink-game
     - **Environment**: Node
     - **Build Command**: `npm install`
     - **Start Command**: `npm start`
     - **Plan**: Free (or upgrade for better performance)

3. **Deploy:**
   - Click "Create Web Service"
   - Wait for deployment (2-3 minutes)
   - Your game will be live at `https://dont-drink-game.onrender.com`

### Environment Variables
No environment variables required! The app works out of the box.

### Health Check
The server includes a `/health` endpoint for monitoring:
```bash
curl https://your-app.onrender.com/health
# Returns: {"status":"ok","rooms":0}
```

---

## 🧪 Testing

See [TEST_INSTRUCTIONS.md](TEST_INSTRUCTIONS.md) for comprehensive testing guide.

### Quick Test
```bash
# Start server
npm start

# Open in browser
http://localhost:3000

# Test flow:
1. Create room as host
2. Join from another device/window
3. Start game and play!
```

---

## 📚 Documentation

- **[IMPLEMENTATION_SUMMARY.md](IMPLEMENTATION_SUMMARY.md)** - Complete technical overview
- **[TEST_INSTRUCTIONS.md](TEST_INSTRUCTIONS.md)** - Detailed testing guide
- **[README.md](README.md)** - You are here!

---

## 🎯 Roadmap

### ✅ Completed (v1.0)
- [x] 4 complete games with full question databases
- [x] 4 play modes (Offline, Mobile, Spotlight, Mixmaster)
- [x] Real-time multiplayer with Socket.IO
- [x] Mobile-responsive design
- [x] Anonymous question submission
- [x] Room code system with QR codes
- [x] Disconnect/reconnect handling
- [x] 1000+ curated questions

### 🔮 Future Enhancements (v2.0)
- [ ] User accounts and profiles
- [ ] Game statistics dashboard
- [ ] Question voting/rating system
- [ ] Leaderboards and scoring
- [ ] Sound effects and animations
- [ ] Timer for timed modes
- [ ] More game types
- [ ] Question packs/DLC
- [ ] Private custom question libraries

---

## 🤝 Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

### Guidelines
1. Follow the existing design system (colors, shadows, fonts)
2. Test thoroughly before submitting
3. Update documentation if needed
4. Keep code clean and commented

### Adding Questions
To contribute questions:
1. Edit `questions-database.js`
2. Add to appropriate game and intensity level
3. Follow existing format exactly
4. Submit PR with descriptive title

---

## 📜 License

This project is licensed under the MIT License - see LICENSE file for details.

---

## ⚠️ Content Warning

**This game is intended for adults (18+) only.**

- Contains mature themes and explicit content
- Intensity levels include sexual references and controversial topics
- "Cancelled" mode includes potentially offensive material
- Play responsibly and respect all participants
- Anyone can leave the game at any time

---

## 🎉 Credits

**Built with:**
- Express.js - Web framework
- Socket.IO - Real-time engine
- Poppins - Font (Google Fonts)
- Love, chaos, and questionable decisions

**Special Thanks:**
- Everyone who tested the game and survived
- The brave souls who played "Cancelled" mode
- You, for reading this far!

---

## 📞 Support

Having issues? Check these resources:

1. **Browser Console**: Press F12 → Console tab
2. **Server Logs**: Check terminal where `npm start` is running
3. **Test Instructions**: See [TEST_INSTRUCTIONS.md](TEST_INSTRUCTIONS.md)
4. **Implementation Details**: See [IMPLEMENTATION_SUMMARY.md](IMPLEMENTATION_SUMMARY.md)

Common issues:
- **"Cannot connect"** → Check if server is running
- **"Room not found"** → Verify room code is correct (6 characters)
- **"No questions"** → Check questions-database.js loaded properly
- **Mobile not joining** → Ensure same WiFi network (local) or proper deployment URL

---

## 🌟 Star History

If you enjoyed this project, please consider giving it a ⭐ on GitHub!

---

<div align="center">

**Made with 💜 for chaotic party nights**

[Report Bug](https://github.com/yourusername/dont-drink-game/issues) • [Request Feature](https://github.com/yourusername/dont-drink-game/issues) • [Discussion](https://github.com/yourusername/dont-drink-game/discussions)

</div>
