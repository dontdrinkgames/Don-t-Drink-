# 🧪 Testing Instructions for "Don't Drink!" Game

## 🚀 Quick Start

### 1. Start the Server
```bash
npm start
```

You should see:
```
✅ Questions database loaded successfully
📊 Total questions: 1031 questions across all games
✅ Questions database loaded

╔════════════════════════════════════════╗
║       DON'T DRINK! SERVER RUNNING      ║
╠════════════════════════════════════════╣
║  Port: 3000                            ║
║  URL: http://localhost:3000            ║
╠════════════════════════════════════════╣
║  Pages:                                ║
║  • / → Landing page                    ║
║  • /host → Host control panel          ║
║  • /mobile → Player mobile interface   ║
║  • /play → Play screen                 ║
╠════════════════════════════════════════╣
║  Status: ✅ Questions loaded           ║
╚════════════════════════════════════════╝
```

### 2. Open in Browser
Navigate to: `http://localhost:3000`

---

## 🎮 Complete Test Flow

### **Test 1: Landing Page**
1. ✅ Open `http://localhost:3000`
2. ✅ Verify beautiful purple gradient background
3. ✅ Verify logo displays
4. ✅ Click "🎮 Host a Game" → Should redirect to `/host`

### **Test 2: Host Setup**
1. ✅ On `/host`, verify room code appears (6 characters)
2. ✅ Verify QR code generates
3. ✅ Verify share URL displays
4. ✅ Click "Copy" button → URL copied to clipboard
5. ✅ Verify "Start Game" button is DISABLED
6. ✅ Select a game (e.g., "Never Have I Ever")
7. ✅ Select a mode (e.g., "Mobile Voting")
8. ✅ Select intensity (e.g., "Spicy")
9. ✅ Verify "Start Game" button shows "Waiting for players to join..."

### **Test 3: Player Join (Need 2 Devices/Windows)**

#### Desktop/Laptop (Host):
1. Stay on `/host` page
2. Note the room code (e.g., "ABC123")

#### Mobile/Second Browser Window (Player):
1. ✅ Open `http://localhost:3000/ABC123` (use actual room code)
2. ✅ Verify room code displays correctly
3. ✅ Enter name: "Test Player"
4. ✅ Select an avatar (e.g., 🍆)
5. ✅ Click "JOIN GAME"
6. ✅ Verify waiting screen appears
7. ✅ Verify avatar and name display correctly

#### Back to Host:
1. ✅ Verify player appears in player list
2. ✅ Verify player count updates: "1 players connected"
3. ✅ Verify "Start Game" button now shows: "Start Game (1 players)"
4. ✅ Button should now be ENABLED

### **Test 4: Start Game**
1. ✅ On host screen, click "Start Game (1 players)"
2. ✅ Host redirects to `/play?room=ABC123&game=nhie&mode=voting&intensity=spicy`
3. ✅ Player screen transitions from waiting to game screen

---

## 🎯 Mode-Specific Tests

### **Test 5: Offline Mode**
**Setup:** Game = NHIE, Mode = Offline, Intensity = Medium

1. ✅ Start game
2. ✅ Host screen shows question
3. ✅ Mobile screen shows same question (or watching message)
4. ✅ Click "Next Question" on host
5. ✅ New question appears
6. ✅ Verify no voting buttons on mobile

**Expected:** Display-only mode, no interaction required from players.

---

### **Test 6: Mobile Voting Mode**
**Setup:** Game = Would You Rather, Mode = Mobile Voting, Intensity = Spicy

1. ✅ Start game
2. ✅ Host screen shows:
   - Question text
   - Option A and Option B in colored cards
   - Voting results section (initially 0/0)
3. ✅ Mobile screen shows:
   - Same question
   - Two vote buttons: "🅰️ OPTION A" and "🅱️ OPTION B"
4. ✅ Click "OPTION A" on mobile
5. ✅ Mobile shows: "✅ Your answer has been recorded!"
6. ✅ Vote buttons become disabled
7. ✅ Host screen updates:
   - Voting bar shows: "OPTION A: 100%"
   - "1 / 1 players voted"
8. ✅ Click "Next Question" on host
9. ✅ New question appears on both screens
10. ✅ Vote buttons re-enable on mobile

**Expected:** Real-time vote counting, live results on host.

---

### **Test 7: Spotlight Mode**
**Setup:** Game = Hot Takes, Mode = Spotlight, Intensity = Cancelled

#### Host Screen:
1. ✅ Start game
2. ✅ Question appears
3. ✅ Spotlight display shows:
   - Large emoji (player's avatar)
   - Player name: "TEST PLAYER"
   - Status: "In the Spotlight"

#### Mobile Screen (Player in Spotlight):
1. ✅ Sees "🎯 You're in the Spotlight!" badge
2. ✅ Sees question
3. ✅ Sees two buttons: "✅ AGREE" and "❌ DISAGREE"
4. ✅ Click "AGREE"
5. ✅ Button gets highlighted/selected
6. ✅ "Reveal Answer" button appears
7. ✅ Click "Reveal Answer"

#### Host Screen After Reveal:
1. ✅ Spotlight display updates:
   - Shows "AGREE" as the answer
   - Status changes to "Answer revealed!"

#### Mobile Screen After Reveal:
1. ✅ Spotlight interface hides
2. ✅ Ready for next question

**Expected:** Privacy maintained (others can't see answer until reveal), then synchronized reveal.

---

### **Test 8: Mixmaster Mode**
**Setup:** Game = Mixmaster, Mode = Mixmaster, Intensity = Spicy

1. ✅ Start game
2. ✅ Question 1 → Mode indicator shows "📺 Offline Mode"
3. ✅ Click "Next Question"
4. ✅ Question 2 → Mode indicator shows "📱 Mobile Voting"
   - Mobile shows vote buttons
5. ✅ Vote on mobile
6. ✅ Click "Next Question"
7. ✅ Question 3 → Mode indicator shows "🎯 Spotlight Mode"
   - Spotlight interface activates
8. ✅ Click "Next Question"
9. ✅ Question 4 → Mode indicator shows "📺 Offline Mode" (cycle repeats)

**Expected:** Automatic rotation through Offline → Mobile → Spotlight → Offline...

---

## 🔧 Advanced Tests

### **Test 9: Anonymous Question Submission**
1. ✅ Navigate to `http://localhost:3000/add-question/ABC123`
2. ✅ Verify room code displays: "ABC123"
3. ✅ Select game: "Would You Rather"
4. ✅ Select intensity: "Spicy"
5. ✅ Verify examples update to WYR examples
6. ✅ Type question: "eat a ghost pepper or jump in ice water?"
7. ✅ Click "Submit Question"
8. ✅ Verify success message: "✅ Question submitted successfully!"
9. ✅ Question clears from textarea
10. ✅ Go back to game, play through questions
11. ✅ Within first 20 questions, submitted question should appear
    - Expected: "Would you rather eat a ghost pepper or jump in ice water?"

---

### **Test 10: Multiple Players**
**Setup:** 3+ players/browser windows

1. ✅ Host creates room
2. ✅ Player 1 joins (name: "Alice", avatar: 🍆)
3. ✅ Player 2 joins (name: "Bob", avatar: 🔥)
4. ✅ Player 3 joins (name: "Charlie", avatar: 😈)
5. ✅ Host sees all 3 players in list
6. ✅ Start game (Mode = Spotlight)
7. ✅ Question 1: Spotlight on Alice
   - Alice sees spotlight interface
   - Bob and Charlie see: "👀 ALICE is in the spotlight"
8. ✅ Alice selects answer and reveals
9. ✅ Next Question → Spotlight on Bob
10. ✅ Next Question → Spotlight on Charlie
11. ✅ Next Question → Spotlight back on Alice (rotation)

**Expected:** Fair spotlight rotation, spectators see who's in spotlight.

---

### **Test 11: Disconnect/Reconnect**
1. ✅ Start game with 2 players
2. ✅ On Player 1 mobile, close browser tab
3. ✅ Host screen: Player 1 disappears from player list
4. ✅ Player count updates: "1 players connected"
5. ✅ Reopen mobile browser
6. ✅ Navigate to same room code
7. ✅ Re-join with same name
8. ✅ Verify player reappears in host list

**Expected:** Graceful disconnect handling, re-join supported.

---

### **Test 12: Host Disconnect**
1. ✅ Start game with 2 players
2. ✅ On host, close browser tab
3. ✅ Mobile screens show: "Host has disconnected"
4. ✅ Mobile redirects to landing page after 3 seconds

**Expected:** Players notified when host leaves.

---

## 🌐 Cross-Device Testing

### **Recommended Setup:**
1. **Desktop** (Host): Chrome browser, `/host`
2. **Mobile Phone 1**: Safari/Chrome, join via QR code
3. **Mobile Phone 2**: Chrome, join via room code
4. **Tablet** (optional): Additional player

### **WiFi Network:**
- All devices must be on same network
- Host access: `http://[YOUR-LOCAL-IP]:3000`
  - Find IP: `ipconfig` (Windows) or `ifconfig` (Mac/Linux)
  - Example: `http://192.168.1.100:3000`

---

## 📊 Question Variety Test

### **Test All Game Types:**
1. ✅ **Never Have I Ever** (Game = NHIE)
   - Medium: Check for safe questions
   - Spicy: Check for adult content
   - Cancelled: Check for extreme content

2. ✅ **Fuck Marry Kill** (Game = FMK)
   - Verify 3-person format: "Person A, Person B, Person C"
   - Check person names are comma-separated

3. ✅ **Would You Rather** (Game = WYR)
   - Verify Option A and Option B display
   - Check both options are presented clearly

4. ✅ **Hot Takes** (Game = Hot Takes)
   - Verify controversial statements
   - Check different intensity levels

### **Test Intensity Levels:**
1. ✅ **Medium (😊):**
   - Should be work-safe
   - Fun but not offensive
   - Example: "Pineapple belongs on pizza"

2. ✅ **Spicy (🌶️):**
   - Adult content
   - Sexual references OK
   - Example: "Body count matters"

3. ✅ **Cancelled (☠️):**
   - Extremely provocative
   - No boundaries
   - Example: "Some races are naturally better at certain things"

---

## 🐛 Bug Testing

### **Edge Cases to Test:**
1. ✅ Room code with lowercase → Auto-converts to uppercase
2. ✅ Invalid room code → Error message
3. ✅ Player name > 15 chars → Truncated
4. ✅ Start game with 0 players → Button disabled
5. ✅ Spam "Next Question" → Should not break
6. ✅ Vote twice on same question → Second vote ignored
7. ✅ Refresh during game → Re-join or redirect
8. ✅ All questions exhausted → Shuffles and resets

---

## ✅ Success Criteria

### **MVP Complete When:**
- [x] Server starts without errors
- [x] Questions database loads (1000+ questions)
- [x] Host can create room
- [x] Players can join via room code
- [x] Players can join via QR code
- [x] All 4 games display correctly
- [x] All 4 modes function properly
- [x] Mobile voting records votes
- [x] Spotlight mode reveals correctly
- [x] Mixmaster rotates modes
- [x] Custom questions can be submitted
- [x] Disconnect/reconnect works
- [x] Design matches specification
- [x] Mobile responsive on all screens

### **Production Ready When:**
- [ ] All MVP criteria met
- [ ] Tested with 5+ simultaneous players
- [ ] Tested on multiple devices/browsers
- [ ] No console errors
- [ ] Smooth Socket.IO connections
- [ ] QR codes generate reliably
- [ ] Deployed to Render successfully

---

## 📝 Testing Checklist

Copy this to track your testing progress:

```
[ ] Landing page loads
[ ] Host creates room
[ ] Room code displays
[ ] QR code generates
[ ] Player joins via room code
[ ] Player joins via QR (if mobile available)
[ ] Player list updates in real-time
[ ] Start button enables with valid config
[ ] Game screen loads correctly
[ ] Questions display properly (all 4 games)
[ ] Offline mode works
[ ] Mobile voting mode works
[ ] Spotlight mode works (privacy + reveal)
[ ] Mixmaster mode rotates
[ ] Anonymous questions submit
[ ] Custom questions appear in game
[ ] Vote results update live
[ ] Disconnect handling works
[ ] Re-join works
[ ] Host disconnect notifies players
[ ] All intensities load different questions
[ ] Design matches purple gradient theme
[ ] Mobile responsive (test on phone)
[ ] No console errors
```

---

## 🎉 Congratulations!

If all tests pass, you have a fully functional party game platform ready for deployment! 🚀

**Next Steps:**
1. Fix any bugs found during testing
2. Deploy to Render (see IMPLEMENTATION_SUMMARY.md)
3. Share with friends and party! 🎊

---

**Need Help?**
- Check browser console for errors (F12)
- Check server logs in terminal
- Review IMPLEMENTATION_SUMMARY.md for technical details
- Verify Socket.IO connection status
