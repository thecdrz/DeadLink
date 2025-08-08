# 📊 Chart Visualization Examples & Dynamic Narrative Samples

> **Note**: The Activity Chart visualization has been removed from the `7d!trends` command in favor of enhanced analytics and insights. The narrative examples below remain relevant for the `7d!activity` command.

## Current Implementation (Enhanced Unicode Bar Chart)
```
📈 Recent Activity (2 hours)
▁▂▃▄▅▆▇█ ▇▆▅▄▃▂▁▂ (3/8) 📈 Growing
```
- Uses 8 different height blocks: `▁▂▃▄▅▆▇█`
- Shows current/peak context: `(3/8)` = 3 current, 8 peak
- Clear trend indicators: 📈 Growing, 📉 Declining, ➡️ Steady
- Perfect for small servers (5-10 players)
- Compact and Discord-friendly
- **Enhanced in v2.4.2**: Contextual information added

## NEW in v2.5.0 - Dynamic Narrative Examples

### Empty Server Narratives (Time-Aware)
```
🌙 **The Witching Hour Chronicles**
Day 7, 23:45

The server lies dormant under a blanket of digital darkness. Even the virtual 
crickets have logged off. It's so quiet you can hear the server's hard drive 
thinking 'Is anyone still out there?'

📰 **Last Known Activity**: PlayerName was last spotted 2 hours ago, probably 
off living their best life somewhere with actual people

📉 **Population Trend**: Players seem to be migrating elsewhere. Perhaps they 
discovered the outside world still exists.

🩸 **Blood Moon Approaches**: The horde is preparing for an epic battle... 
against absolutely nobody. Even the zombies seem confused by this tactical situation.
```

### Solo Player Adventures
```
🐺 **Lone Wolf Chronicles**
**PlayerName** — ❤️ 85% HP | 📊 Level 23 | 🧟 156 kills
🏜️ *The distant southern desert wasteland where heat kills*
🕒 Day 5, 14:30

"*in excellent health and battling the heat while exploring the distant southern 
desert wasteland where heat kills during the afternoon heat.*"

💡 **Tactical Recommendations**
🛡️ Find water sources as priority - desert survival is critical
🛡️ Seek shelter during peak heat hours to avoid overheating
🛡️ Watch for scorpions and desert-dwelling zombies

✅ **Status Good**: Managing well - maintain vigilance in this dangerous world
```

### Group Dynamics Storytelling
```
🤝 **Group Adventure** (3 survivors)
**Alice, Bob, Charlie**
⏰ Day 7, 21:45

🤝 Supporting Each Other: Alice and Bob lead the group while Charlie follows 
courageously despite their injuries with the blood moon approaching - racing 
against time as shadows grow longer, making final preparations before the 
darkness arrives.

🔴 **Blood Moon Incoming**
🛡️ The group must prepare for the approaching horde!
```

### Enhanced Survival Suggestions
```
⚠️ **Critical Alerts**
🔴 Emergency medical attention needed - find shelter and heal immediately!

💡 **Tactical Recommendations**  
🛡️ Extremely dangerous - seek fortified shelter or prepare for combat
🛡️ Find secure position - zombies are most active in darkness
🛡️ Ensure good lighting and weapons ready for night encounters
```

## Current Implementation (Enhanced Unicode Bar Chart)
```
📈 Recent Activity (2 hours)
▁▂▃▄▅▆▇█ ▇▆▅▄▃▂▁▂ (3/8) 📈 Growing
```
- Uses 8 different height blocks: `▁▂▃▄▅▆▇█`
- Shows current/peak context: `(3/8)` = 3 current, 8 peak
- Clear trend indicators: 📈 Growing, 📉 Declining, ➡️ Steady
- Perfect for small servers (5-10 players)
- Compact and Discord-friendly
- **NEW in v2.4.2**: Enhanced with contextual information

## Option 1: True Sparkline (Line Chart)
```
📈 Recent Activity (2 hours)
╭─╮   ╭─╮
│ ╰─╮ │ │
╰───╯─╯ ╰─
```
- Uses line drawing characters: `─│╭╮╯╰`
- Shows trends more clearly
- Better for continuous data
- More visually appealing

## Option 2: Enhanced Bar Chart with Values
```
📈 Recent Activity (2 hours)
 3 █▇▆▄▃▂▁▂ 2 players
 2 ░░░████░░ 
 1 ░░░░░░░░░
 0 ░░░░░░░░░
   12 1 2 3 (hours ago)
```
- Shows actual values
- Time labels
- Multiple height levels
- More detailed but larger

## Option 3: Minimalist with Trend Arrow
```
📈 Recent Activity: ▂▃▄▅▆▅▄▃ ↗️ (+1)
```
- Current chart + trend indicator
- Shows direction of change
- Very compact
- Quick to understand

## Option 4: ASCII Line Graph
```
📈 Recent Activity (2 hours)
5 |    *
4 |   / \
3 |  /   *
2 | *     \
1 |/       *
0 +─────────
  2h   1h  now
```
- Traditional line graph style
- Clear data points
- Time axis labels
- Takes more vertical space

## Option 5: Dot Plot with Trend
```
📈 Recent Activity: • •• ••• •••• ••• •• • •• 📈 Trending Up
```
- Uses dots for magnitude
- Very minimal
- Easy to read
- Trend indicator

## Option 6: Percentage Bars
```
📈 Recent Activity (2 hours)
██████████ 100% (4 players) ← Peak
████░░░░░░  40% (2 players)
██░░░░░░░░  20% (1 player)
░░░░░░░░░░   0% (0 players) ← Current
```
- Shows percentage of peak activity
- Clear current vs peak comparison
- Uses filled/empty blocks

## Option 7: Small Server Optimized (RECOMMENDED)
```
📈 Recent Activity (2 hours)
5 █ 
4 █ ░
3 █ █ ░     Current: 3 players
2 █ █ █ ░   Trend: Growing ↗️
1 █ █ █ █ ░
0 ░ ░ ░ ░ ░
  4h 3h 2h 1h now
```
- Optimized for 0-10 player range
- Shows every player count clearly
- Easy to see patterns
- Perfect for small communities

## Option 8: Compact Small Server
```
📈 Activity: ▁▂▃▅█▅▃ (3/5) ↗️ Growing
```
- Current chart + player count + trend
- Very compact for Discord
- Perfect for small servers
- Shows current/max players

## Option 9: Simple Dots (Small Server)
```
📈 Recent: • •• ••• •• • (3 players) → Stable
```
- One dot per player
- Instantly readable
- No math needed
- Clean and minimal

### Peak Activity (5 players)
```
Current: ██████████ 5/5 players ✨ FULL!
Trend:   ▁▂▃▄▅▇█▇▅▄ ↗️ Building up
```

### Typical Evening (3 players)
```
Current: ██████░░░░ 3/5 players
Trend:   ▂▃▄▅▆▅▄▃▂▃ → Steady
```

### Solo Session (1 player)
```
Current: ██░░░░░░░░ 1/5 players
Trend:   ▃▂▁▂▃▂▁▂▁▂ → Lone survivor
```

### Empty Server
```
Current: ░░░░░░░░░░ 0/5 players
Trend:   ▂▁▁░░░░░░░ ↘️ Quiet time
```

### Blood Moon Gathering (All hands!)
```
Current: ██████████ 5/5 players 🩸
Trend:   ▁▁▂▃▅▇████ ⚡ Everyone online!
```

## Which style would you prefer?

1. **Keep current** - It works well and is compact
2. **Sparkline** - More elegant line representation  
3. **Enhanced bars** - More detailed with values/labels
4. **Minimal + trend** - Current chart with trend arrows
5. **Dot plot** - Very simple and clean
6. **Something else** - Combination or different approach

Let me know which appeals to you and I can implement it!
