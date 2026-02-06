# GlutenGuard - Project Status

**Last Updated:** February 6, 2026 (evening)
**Repo:** GitHub (private) → Deployed on Render at https://glutenguard.onrender.com/
**Tech Stack:** Flask (Python) | HTML/CSS/JS (mobile-first) | Anthropic Claude API (Sonnet, vision + web search) | PostgreSQL on Render | JSON file storage (scan history only)

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
- **Caching:** Results saved to PostgreSQL, 30-day expiration. Second search for same restaurant is instant and free.

### 3. Discovery Mode ✅ (NEW - basic)
- Search by cuisine type + location (e.g. "Thai" + "Philadelphia")
- Claude searches web for GF-friendly restaurants of that type in that area
- Returns list of ~5 restaurants with name, address, brief safety note, source
- Shows cached safety scores for any previously searched restaurants
- "Get Full Report" button auto-triggers the full scout (which caches the result)
- Currently a lightweight FMGF proxy — becomes more valuable as database grows with cached scores

### 4. Smart Alternatives ❌ (disabled)
- Built but disabled due to API rate limits (30k tokens/min)
- When restaurant scores <7, searches for 3 nearby alternatives
- "Find Better Options Nearby" button (user-triggered, not automatic)
- Can likely re-enable now that caching is implemented — needs testing

### 5. Hub/Navigation ✅
- Homepage with three feature cards: Label Scanner + Restaurant Scout + Discover
- Back navigation between features
- Consistent mobile-first styling

### 6. User Accounts & Saved Restaurants ✅
- Simple email-based sign-in (no password yet, Flask sessions)
- Save/unsave restaurants from scout results
- "My Safe Spots" page showing all saved restaurants with clickable cards
- Share restaurant reports via native mobile share or clipboard copy
- Shared links use cached results for instant loading
- Save state persists across sessions (PostgreSQL)

### 7. Database Infrastructure ✅
- PostgreSQL on Render (free tier)
- Tables: restaurants (caching), users (accounts), saved_restaurants (junction)
- schema.sql for version control + setup_db.py for initialization
- External URL for local dev, Internal URL for production
- Restaurant caching: normalized name+location key, 30-day TTL, ON CONFLICT upsert
- Bulk cache lookup for discovery mode (get_cached_scores)

---

## Known Issues & Bugs

1. **Rate limits:** Main restaurant scout uses ~25k-28k tokens (web search results are huge). Alternatives push over 30k limit. Caching helps but first searches are still expensive.
2. **Scan history not persistent:** JSON files wipe when Render free tier restarts. Restaurant searches now persist via PostgreSQL.
3. **Restaurant analysis sometimes too generic:** Kalaya (dedicated GF restaurant) scored ~6 instead of 9+. Claude sometimes gives cuisine-generic advice instead of restaurant-specific intel.
4. **Menu items sometimes fabricated:** Claude occasionally makes up menu items not on the actual restaurant's menu.
5. **API costs high:** ~$0.25-0.40 per first restaurant search. Cached = $0.00. Discovery mode adds ~$0.10-0.15 per search.
6. **First search is slow (~40 seconds):** Claude does 4 web searches per restaurant. Needs loading animation to manage perception. Cached searches are instant.
7. **Discovery mode is basic:** Currently mostly proxies FMGF results. Becomes more valuable as database fills with cached safety scores.

---

## TODO (Quick Tasks)

Tasks that came up but aren't part of the main sprint:

- [ ] Deploy latest code to Render (user accounts, share, save features)
- [ ] Rebrand app/repo from GlutenGuard → Celia (code, templates, Render URL)
- [ ] Purchase askcelia.com domain
- [ ] Post first Twitter content (blocked until rate limit clears)
- [ ] Post intro discussion in r/Celiac
- [ ] Add step-by-step loading animation for restaurant scout (timed progress messages during search)
- [ ] Test re-enabling Smart Alternatives now that caching is live

---

## Architecture Notes

- **API Key:** Stored in .env file, hidden via .gitignore, added as environment variable on Render
- **Models:** Using claude-sonnet-4-20250514 for scout, alternatives, and discovery
- **Endpoints:**
  - `/` — Hub page (3 feature cards)
  - `/scan` — Label scanner
  - `/restaurant-scout` — Restaurant scout search + results
  - `/discover` — Discovery mode (cuisine + location search)
  - `/signin` — Email sign-in page
  - `/signout` — Sign out (redirects to hub)
  - `/my-safe-spots` — User's saved restaurants page
  - `/api/restaurant-scout` — POST, main restaurant analysis (with caching)
  - `/api/restaurant-scout/alternatives` — POST, find alternatives (currently disabled)
  - `/api/discover` — POST, discover restaurants by cuisine + location
  - `/api/save-restaurant` — POST, save restaurant to user's safe spots
  - `/api/unsave-restaurant` — POST, remove restaurant from safe spots
  - `/api/check-saved` — POST, check if restaurant is saved by user
- **max_tokens:** Main scout = 10,000. Alternatives = 2,000. Discovery = 2,000.
- **Frontend:** Plain HTML/CSS/JS, no framework. Templates in `/templates/`. Mobile-first responsive.
- **Caching:** PostgreSQL, keyed on normalized name+location, 30-day TTL, upsert on conflict

---

## Key Design Decisions Made

1. **Confidence tool, not research tool** — Features should help users feel confident and look helpful, not just provide information
2. **Search-first for MVP** — Users search specific restaurants, discovery mode is lightweight layer on top
3. **Manual calling over AI calling** — Users make calls themselves with generated scripts. AI calling is a future premium feature.
4. **FMGF as one data point** — Not fully reliable unless restaurant is dedicated GF. Reviews treated as context, not truth.
5. **Location as text input** — User types city/neighborhood rather than browser geolocation (works for researching ahead of time)
6. **Alternatives user-triggered** — Button click, not automatic (to manage API costs and rate limits)
7. **Build in public** — Daily content on X/Twitter + Reddit for marketing and accountability
8. **Rebranded to Celia** — character positioning as "your confident friend who always knows the safe spots." Celia voice on Twitter, developer voice on Reddit.
9. **Domain:** askcelia.com available (not purchased yet)
10. **Discovery = lightweight first** — Returns list with brief notes + "Get Full Report" button, rather than full analysis of multiple restaurants at once. Cheaper, faster, funnels into cached scout.
11. **Launch city-first (likely Philly)** — Pre-populate local restaurants instead of chains. Celiacs need help with local spots more than chains that publish allergen guides. Expand city by city.

---

## Girlfriend's Feedback (Key User Insights)

- Call script questions are decent but she knows what she wants to ask; 8 questions is too many for a restaurant to answer
- Wants: If restaurant isn't safe, recommend nearby similar alternatives. "Could we go to this one instead?" is easier than "we can't go there"
- Wants: "I want Indian food, where can I get it?" → show options ranked by safety ← **Discovery mode addresses this**
- Wants: For to-go orders, ability to call and verify it's GF before ordering
- She's more knowledgeable than average celiac; the app needs to serve people who are less confident about what to ask

---

## Immediate Roadmap (4-Week Sprint starting Feb 5)

### Week 1: Foundation (Feb 5-11)
- ~~PostgreSQL setup on Render, create tables~~ ✅
- ~~Implement caching (save search results to DB)~~ ✅
- ~~Discovery mode backend + frontend~~ ✅
- ~~User accounts (simple email) + save restaurants~~ ✅
- ~~"My Safe Spots" page~~ ✅
- ~~Quick share functionality~~ ✅
- Deploy to Render (next step)

### Week 2: Pre-Population + User Testing (Feb 12-18)
- Pre-populate 50 restaurants (Philly local restaurants across cuisines, not just chains)
- Add loading animation for first-time searches
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

- **Smart alternatives** (re-enable after testing with caching)
- **Travel meal planner:** Pre-trip research, translation cards, airport/airline database
- **AI phone calling:** Premium feature for pre-order verification
- **Group dining mode:** "Suggest a Restaurant" text generator for group chats
- **Date mode:** Romantic, celiac-safe restaurant finder
- **Symptom tracker:** Log meals + symptoms, AI identifies triggers (future app, medical compliance concerns)
- **Streaming responses:** Stream Claude's response so results appear progressively instead of all at once (reduces perceived wait time)

---

## Business Model

- **Free tier:** 10 restaurant searches/month + unlimited label scanning
- **Pro tier ($7.99/month):** 100 searches + saved restaurants + alternatives + all features
- **Future premium ($4.99 add-on):** AI calling credits
- **Cost optimization:** Caching is critical. First search = ~$0.25-0.40. Cached = $0.00. Database grows over time, most searches become free.

---

## Daily Workflow

1. Start new Claude.ai chat with PROGRESS.md attached
2. Code for 1.5-2 hours (use Claude Code for implementation, Claude.ai for strategy)
3. Post content when ready (not tied to coding days)
4. Update PROGRESS.md at end of session
5. Commit + push to GitHub → Render auto-deploys

**Use Claude.ai for:** Strategic decisions, content creation, plan adjustments, debugging approach
**Use Claude Code for:** Actually writing and running code
**Test locally first** (`python app.py` → localhost:5000) before pushing to Render

---

## Session Log

### Feb 5
- ✅ PostgreSQL database live with 3 tables
- ✅ Created Twitter @UseCelia + Reddit u/glutenfreebuilder
- ✅ Created social presence as "Celia" (@UseCelia, u/glutenfreebuilder)
- 🔄 Full app rebrand to Celia is future TODO

### Feb 6
- ✅ Restaurant caching implemented (database.py + app.py)
- ✅ Fixed JSON parsing for restaurant scout (Claude wraps JSON in markdown fences)
- ✅ Tested caching locally — second search is instant
- ✅ Discovery mode built: backend endpoint, frontend UI, hub card
- ✅ Auto-search on "Get Full Report" from discovery
- ✅ 3 Reddit comments in r/Celiac (morning)
- 🔄 Twitter @UseCelia still rate limited — post caching economics tweet when cleared
- 💡 Decision: Launch city-first (Philly) instead of chains — local restaurants are where celiacs need the most help
- 💡 Discovery mode is basic now but improves as database grows with cached scores

### Feb 6 (continued - afternoon/evening)
- ✅ Simple user accounts implemented (email-only, Flask sessions)
- ✅ "Save Restaurant" button added to scout results (prominent green button in score card)
- ✅ "My Safe Spots" page created - dedicated page showing all saved restaurants
- ✅ Save/unsave functionality - users can remove restaurants from safe spots
- ✅ Better save feedback - button shows "Saved to Safe Spots ✓" with clear state changes
- ✅ Share functionality implemented:
  - Native share sheet on mobile
  - Clipboard copy on desktop
  - Shareable URLs use original search terms for cache hits
  - Recipients get instant cached results
- ✅ Fixed cache lookup for shared links (was using Claude's formatted name, now uses original search term)
- ✅ Added logging for cache hits/misses in backend
- 📋 Week 1 core features complete! Ready for deployment.
- 📋 Next: Deploy to Render, then start Week 2 (pre-populate restaurants + user testing)
