# GlutenGuard - Project Status

**Last Updated:** February 5, 2026
**Repo:** GitHub (private) → Deployed on Render at https://glutenguard.onrender.com/
**Tech Stack:** Flask (Python) | HTML/CSS/JS (mobile-first) | Anthropic Claude API (Sonnet, vision + web search) | JSON file storage (no database yet)

---

## Vision & Positioning

**Not a research tool. A confidence tool.**

Core problem: Celiacs feel "high-maintenance" when making plans. They don't want to be difficult, but their condition forces constant questions, research, and anxiety.

Solution: GlutenGuard makes you the friend who always knows the best spots — not the difficult one who needs accommodations.

Tagline: "Stop apologizing for having celiac. Be confident, not high-maintenance."

---

## What's Built & Working

### 1. Label Scanner ✅
- Photo upload → Claude Vision analyzes ingredient labels
- Returns SAFE / UNSAFE / INVESTIGATE verdict with color coding
- Identifies hidden gluten, cross-contamination warnings, certifications
- Mobile-optimized camera capture
- Scan history (JSON-based, resets on Render restart)
- Deployed and working at glutenguard.onrender.com

### 2. Restaurant Safety Scout ✅ (needs polish)
- Search by restaurant name + optional location
- Claude does web research (restaurant website, FMGF, Yelp/Google reviews)
- Returns structured JSON: safety score (0-10), menu analysis, kitchen risks, positive indicators
- Menu items categorized: ✅ Likely Safe | ⚠️ Ask First | 🚩 Red Flags
- Call script generator with customizable questions (quick/thorough presets)
- Post-call questionnaire (7 yes/no/unsure questions)
- Final safety report with GO / NO-GO / PROCEED WITH CAUTION
- Share report button (native share on mobile, clipboard on desktop)

### 3. Smart Alternatives ❌ (disabled)
- Built but disabled due to API rate limits (30k tokens/min)
- When restaurant scores <7, searches for 3 nearby alternatives
- "Find Better Options Nearby" button (user-triggered, not automatic)
- Blocked until caching is implemented

### 4. Hub/Navigation ✅
- Homepage with two feature cards: Label Scanner + Restaurant Scout
- Back navigation between features
- Consistent mobile-first styling

### 5. Database Infrastructure ✅ (NEW)
- PostgreSQL on Render (free tier)
- Tables: restaurants (caching), users (accounts), saved_restaurants (junction)
- schema.sql for version control + setup_db.py for initialization
- External URL for local dev, Internal URL for production
---

## Known Issues & Bugs

1. **Rate limits:** Main restaurant scout uses ~25k-28k tokens (web search results are huge). Alternatives push over 30k limit. Must implement caching before re-enabling.
2. **No database persistence:** JSON files wipe when Render free tier restarts. Scan history and restaurant searches don't persist.
3. **Restaurant analysis sometimes too generic:** Kalaya (dedicated GF restaurant) scored ~6 instead of 9+. Claude sometimes gives cuisine-generic advice instead of restaurant-specific intel.
4. **Menu items sometimes fabricated:** Claude occasionally makes up menu items not on the actual restaurant's menu.
5. **API costs high:** ~$0.25-0.40 per restaurant search. Needs optimization via caching and token reduction.
6. **No user accounts:** No way to save restaurants across sessions or devices.
7. **Twitter @UseCelia rate limited** — locked for 24hrs, resolves Feb 6
---

## TODO (Quick Tasks)

Tasks that came up but aren't part of the main sprint:

- [ ] Rebrand app/repo from GlutenGuard → Celia (code, templates, Render URL)
- [ ] Purchase askcelia.com domain
- [ ] Post first Twitter content (blocked until Feb 6 rate limit clears)
- [ ] Post intro discussion in r/Celiac

---

## Architecture Notes

- **API Key:** Stored in .env file, hidden via .gitignore, added as environment variable on Render
- **Models:** Using claude-sonnet-4-20250514 for both scout and alternatives
- **Endpoints:**
  - `/` — Hub page
  - `/scanner` — Label scanner
  - `/restaurant-scout` — Restaurant scout search + results
  - `/api/restaurant-scout` — POST, main restaurant analysis
  - `/api/restaurant-scout/alternatives` — POST, find alternatives (currently disabled)
- **max_tokens:** Main scout = 10,000 (reduced from 16,000). Alternatives = 2,000 (reduced from 4,000).
- **Frontend:** Plain HTML/CSS/JS, no framework. Templates in `/templates/`. Mobile-first responsive.

---

## Key Design Decisions Made

1. **Confidence tool, not research tool** — Features should help users feel confident and look helpful, not just provide information
2. **Search-first for MVP** — Users search specific restaurants, discovery mode coming next
3. **Manual calling over AI calling** — Users make calls themselves with generated scripts. AI calling is a future premium feature.
4. **FMGF as one data point** — Not fully reliable unless restaurant is dedicated GF. Reviews treated as context, not truth.
5. **Location as text input** — User types city/neighborhood rather than browser geolocation (works for researching ahead of time)
6. **Alternatives user-triggered** — Button click, not automatic (to manage API costs and rate limits)
7. **Build in public** — Daily content on X/Twitter + Reddit for marketing and accountability
8. **Rebranded to Celia** — character positioning as "your confident friend who always knows the safe spots." Celia voice on Twitter, developer voice on Reddit.
9. **Domain:** askcelia.com available (not purchased yet)
---

## Girlfriend's Feedback (Key User Insights)

- Call script questions are decent but she knows what she wants to ask; 8 questions is too many for a restaurant to answer
- Wants: If restaurant isn't safe, recommend nearby similar alternatives. "Could we go to this one instead?" is easier than "we can't go there"
- Wants: "I want Indian food, where can I get it?" → show options ranked by safety
- Wants: For to-go orders, ability to call and verify it's GF before ordering
- She's more knowledgeable than average celiac; the app needs to serve people who are less confident about what to ask

---

## Immediate Roadmap (4-Week Sprint starting Feb 5)

### Week 1: Foundation (Feb 5-11)
- Day 1 (Feb 5): PostgreSQL setup on Render, create tables
- Day 2 (Feb 6): Implement caching (save search results to DB)
- Day 3 (Feb 7): Discovery mode backend (/api/discover)
- Day 4 (Feb 8): Discovery mode frontend UI
- Day 5 (Feb 9): User accounts (simple email) + save restaurants
- Day 6 (Feb 10): "My Safe Spots" page
- Day 7 (Feb 11): Quick share functionality + deploy

### Week 2: Pre-Population + User Testing (Feb 12-18)
- Pre-populate 50 chain restaurants (~$15 API cost)
- Improve search quality and ranking
- Onboarding flow
- Share with 5-10 celiac beta testers
- Fix issues from testing

### Week 3: Accounts & Limits (Feb 19-25)
- Proper auth (Firebase/Supabase)
- Usage limits (free: 10 searches/month)
- Pricing page + Stripe integration ($7.99/month Pro)
- Polish and prep for launch

### Week 4: Launch & Iterate (Feb 26 - Mar 2)
- Public launch
- Monitor metrics
- Iterate based on feedback
- Start building next priority feature

---

## Build in Public - Content Strategy

**Post 1x/day on X/Twitter, 2-3x/week on Reddit**

**Accounts:**
- Twitter/X: @UseCelia
- Reddit: u/glutenfreebuilder (active in r/Celiac, r/glutenfree, r/CeliacLifestyle)

Content pillars:
1. **Building Journey** (3x/week) — Process, struggles, wins
2. **Celiac Education** (2x/week) — Helpful, shareable content
3. **Product Teasers** (2x/week) — Feature demos, before/after

Weekly cadence: Mon=building update, Tue=celiac education, Wed=product teaser, Thu=struggle/lesson, Fri=community question, Sat=feature demo, Sun=week recap

---

## Future Features (Backlog)

- **Discovery mode:** "Show me safe Thai restaurants in Philly" → ranked list
- **Smart alternatives** (re-enable after caching)
- **Travel meal planner:** Pre-trip research, translation cards, airport/airline database
- **AI phone calling:** Premium feature for pre-order verification
- **Group dining mode:** "Suggest a Restaurant" text generator for group chats
- **Date mode:** Romantic, celiac-safe restaurant finder
- **Symptom tracker:** Log meals + symptoms, AI identifies triggers (future app, medical compliance concerns)
- **Pre-populate top 500 chains** across major cities

---

## Business Model

- **Free tier:** 10 restaurant searches/month + unlimited label scanning
- **Pro tier ($7.99/month):** 100 searches + saved restaurants + alternatives + all features
- **Future premium ($4.99 add-on):** AI calling credits
- **Cost optimization:** Caching is critical. First search = ~$0.25-0.40. Cached = $0.00. Database grows over time, most searches become free.

---

## Daily Workflow

1. Check in with Claude.ai chat: "Day X starting"
2. Code for 1.5-2 hours (use Claude Code for implementation)
3. Post content (30 min)
4. End of day check-in: what was built, issues, metrics

**Use Claude.ai for:** Strategic decisions, content creation, plan adjustments, debugging approach
**Use Claude Code for:** Actually writing and running code

---

## Session Log

### Day 1 - Feb 5, 2026
- ✅ PostgreSQL database live with 3 tables
- ✅ Created Twitter @UseCelia + Reddit u/glutenfreebuilder
- ✅ Created social presence as "Celia" (@UseCelia, u/glutenfreebuilder)
- 🔄 Full app rebrand to Celia is future TODO
- 🔄 Tomorrow: Implement caching logic in restaurant-scout endpoint