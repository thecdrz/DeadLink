# Developer Notes

## Version 2.5.0 - Dynamic Narrative Engine

### New Narrative System Architecture
The v2.5.0 update completely revolutionizes how HordeComms tells stories about server activity. The new system includes:

#### Core Narrative Functions
- `generateActivityMessage()` - Main router for different player scenarios
- `generateEmptyServerNarrative()` - Specialized empty server storytelling
- `generateSoloPlayerNarrative()` - Enhanced solo player stories 
- `generateGroupNarrative()` - Multi-player group dynamics

#### Helper Functions for Rich Storytelling
- `generateEnhancedSoloStory()` - Multiple template solo narratives
- `getEmptyServerAtmosphere()` - Time-specific atmospheric descriptions
- `getEnhancedSurvivalSuggestions()` - Organized tactical recommendations
- `getLastActivityFlavor()` - Humorous descriptions for inactive players
- `getTrendNarrative()` - Server population trend storytelling
- `getEmptyServerHordeNarrative()` - Blood moon stories for empty servers

#### Key Design Principles
1. **Humor Integration** - Every narrative includes entertaining elements
2. **Template Variety** - Multiple story options prevent repetition
3. **Time Awareness** - Stories adapt to morning/afternoon/evening/night
4. **Context Sensitivity** - Incorporates health, location, and server trends
5. **Graceful Degradation** - Works even with missing data

### Testing Scenarios

#### Empty Server Testing
Use these times to test different atmospheric descriptions:
- Morning (06:00-12:00): Dawn narratives with optimistic tone
- Afternoon (12:00-18:00): High noon scenarios with heat references  
- Evening (18:00-22:00): Twilight stories with dramatic flair
- Night (22:00-06:00): Dark scenarios with mysterious atmosphere

#### Solo Player Testing
Test with players at different health levels:
- 80-100% health: Positive, encouraging narratives
- 50-79% health: Cautionary tales with mild concern
- 20-49% health: Urgent medical recommendations
- 0-19% health: Critical emergency messaging

#### Group Testing
Test with different group compositions:
- All healthy: Elite team narratives
- Mixed health: Support dynamics stories
- Multiple wounded: Crisis management scenarios
- Critical players: Emergency response narratives

## Times for reference
In the game's console, use `settime` and `gettime` to test different times for 7d!time.

At the time of writing, the horde starts at 22:00 on Day 7 and ends at 04:00 on Day 8.

## Useful timestamps for testing
* Day 5, 04:00 - 100000
* Day 6, 20:00 - 140000
* Day 7, 06:00 - 150000
* Day 7, 21:00 - 165000
* Day 7, 23:30 - 167500
* Day 8, 02:00 - 170000
* Day 8, 06:30 - 174500
