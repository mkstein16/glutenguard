# Celia - Project Status

**Last Updated:** February 17, 2026
**Repo:** GitHub (private) → Deployed on Render at https://glutenguard.onrender.com/ → askcelia.com (DNS connected, SSL pending)
**Tech Stack:** Flask (Python) | HTML/CSS/JS (mobile-first) | Anthropic Claude API (Sonnet, vision + web search) | PostgreSQL on Render | JSON file storage (scan history only)

---

## Vision & Positioning

**Not a research tool. A confidence tool.**

Core problem: Celiacs feel "high-maintenance" when making plans. They don't want to be difficult, but their condition forces constant questions, research, and anxiety.

Solution: Celia makes you the friend who always knows the best spots — not the difficult one who needs accommodations.

Tagline: "Your confident friend for dining out gluten-free"

---

## What's Built & Working

### 1. Label Scanner ✅
- Photo upload → Claude Vision analyzes ingredient labels
- Returns SAFE / UNSAFE / INVESTIGATE verdict with color coding
- Identifies hidden gluten, cross-contamination warnings, certifications
- Mobile-optimized camera capture
- Scan history (JSON-based, resets on Render restart)
- Deployed and working at glutenguard.onrender.com

### 2. Restaurant Safety Scout ✅ (redesigned)
- Search by restaurant name + optional location
- Claude does web research (restaurant website, FMGF, Yelp/Google reviews)
- Returns structured JSON: safety score (0-10), menu analysis, kitchen risks, positive indicators
- **New scannable results layout:**
  - Large score circle with gradient colors (green/amber/red)
  - "Why It's Safe" section with bullet points
  - Menu highlights shown upfront as pills
  - "Things to Know" warnings section
  - Expandable sections for call script and full analysis
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
- Now uses claude-haiku-4-5 instead of Sonnet for ~5-7x cost reduction

### 4. Smart Alternatives ✅ (re-enabled)
- Re-enabled with cache awareness — alternatives endpoint checks cache for each result using get_cached_scores
- When user clicks 'Scout This Restaurant' on an alternative and gets rate limited, gracefully falls back to 'Request This Restaurant' button instead of showing an error
- Gets more useful as database grows with cached restaurants
- When restaurant scores <7, searches for 3 nearby alternatives
- "Find Better Options Nearby" button (user-triggered, not automatic)

### 5. Hub/Navigation ✅ (redesigned)
- **Search-first homepage:** Restaurant name + location search bar as primary action
- Social proof line with dynamic restaurant count from database
- Discover as secondary "Browse" card, Label Scanner under "Quick Tools"
- **First-time visitor onboarding:** 3 swipeable cards, dot indicators, arrow navigation, Skip button, localStorage flag
- **Bottom navigation bar:** Home, Saved, Account
- **Account modal:** Bottom sheet with sign in/out
- Back navigation between features
- Warm gradient background (peachy to cream)
- Inter font family + consistent design system
- Mobile-first responsive styling

### 6. User Accounts & Saved Restaurants ✅
- Simple email-based sign-in (no password yet, Flask sessions)
- Save/unsave restaurants from scout results
- **"My Safe Spots" page:** Shows saved restaurants with score circles, "View Report" auto-loads cached results
- Share restaurant reports via native mobile share or clipboard copy
- Shared links use cached results for instant loading
- Save state persists across sessions (PostgreSQL)

### 7. Database Infrastructure ✅
- PostgreSQL on Render
- Tables: restaurants (caching), users (accounts + search_count), saved_restaurants (junction), anonymous_usage (IP tracking), waitlist (Pro signups), restaurant_requests (async analysis queue)
- schema.sql for version control + setup_db.py for initialization
- External URL for local dev, Internal URL for production
- Restaurant caching: normalized name+location key, 30-day TTL, ON CONFLICT upsert
- Bulk cache lookup for discovery mode (get_cached_scores)

### 8. Cost Protection & Growth Controls ✅
- Free search limit: 5 uncached restaurant scout searches per user (cached searches don't count)
- Anonymous users tracked by IP, signed-in users tracked by email
- IP rate limiting: max 3 uncached searches per hour per IP (in-memory, resets on restart)
- Waitlist signup: users who hit the limit can join Pro waitlist (saved to PostgreSQL)
- Request a Restaurant: users can request specific restaurants for async analysis within 24 hours
- fulfill_requests.py: batch script to process restaurant requests with 60-second delays
- prepopulate.py: batch script to pre-cache restaurants from a hardcoded list

---

## Known Issues & Bugs

1. **Rate limits:** Main restaurant scout uses ~25k-28k tokens (web search results are huge). Alternatives push over 30k limit. Caching helps but first searches are still expensive.
2. **Scan history not persistent:** JSON files wipe when Render free tier restarts. Restaurant searches now persist via PostgreSQL.
3. ~~**Restaurant analysis sometimes too generic:** Kalaya (dedicated GF restaurant) scored ~6 instead of 9+. Claude sometimes gives cuisine-generic advice instead of restaurant-specific intel.~~ **Fixed Feb 7:** New 5-tier scoring rubric with hard rules (dedicated GF kitchen = min 9, certified = min 9) and instructions to not penalize for generic cuisine risks.
4. **Menu items sometimes fabricated:** Claude occasionally makes up menu items not on the actual restaurant's menu. *(Feb 7: Prompt now explicitly instructs not to fabricate menu items or fill gaps with guesses.)*
5. **API costs high:** ~$0.25-0.40 per first restaurant search. Cached = $0.00. Discovery mode adds ~$0.10-0.15 per search. *(Feb 7: Improved cache key normalization reduces duplicate searches — e.g. "P.S. & Co." and "PS and Co" now hit the same cache entry.)*
6. ~~**First search is slow (~40 seconds):** Claude does 4 web searches per restaurant. Needs loading animation to manage perception. Cached searches are instant.~~ **Fixed Feb 7:** Step-by-step loading animation with timed progress messages. Cache hits skip animation entirely.
7. **Discovery mode is basic:** Currently mostly proxies FMGF results. Becomes more valuable as database fills with cached safety scores.
8. 8 is intentionally skipped to avoid renumbering.
9. **Render free plan discontinued:** render.yaml updated to plan: starter. Also fixed Python version mismatch (3.11.6 → 3.10.2), added runtime.txt, unpinned psycopg2-binary version.

---

## TODO (Quick Tasks)

Tasks that came up but aren't part of the main sprint:

- [x] Deploy latest code to Render ✅ Feb 17
- [x] Rebrand app from GlutenGuard → Celia (code, templates) ✅ Complete
- [ ] Rename repo and Render URL to match Celia branding
- [x] Purchase askcelia.com domain ✅ Feb 17 (Squarespace, $20/year)
- [ ] Grab Twitter handle @celiaknows (rate limited, try again tomorrow)
- [ ] Post intro discussion in r/Celiac (building presence first — day 5-7 target)
- [x] Add step-by-step loading animation for restaurant scout (timed progress messages during search) ✅ Feb 7
- [x] Test re-enabling Smart Alternatives now that caching is live ✅ Feb 11
- [x] Deploy all Feb 11 changes to Render ✅ Feb 17
- [x] Verify prepopulate script completed (64 restaurants: 43 Philly + 20 national chains + 1 extra) ✅ Feb 11
- [ ] Grab Twitter handle @celiaknows
- [ ] Post intro/feedback request in r/Celiac (after deploy is live and pre-cache is confirmed)
- [x] Build onboarding flow (3 swipeable cards for new users) ✅ Feb 17
- [x] Set SECRET_KEY environment variable in Render dashboard ✅ Feb 17
- [ ] Verify askcelia.com is live with SSL
- [ ] Smoke test live site end-to-end

---

## Architecture Notes

- **API Key:** Stored in .env file, hidden via .gitignore, added as environment variable on Render
- **Models:** Using claude-sonnet-4-20250514 for scout and alternatives. Using claude-haiku-4-5-20250929 for discovery mode.
- **Endpoints:**
  - `/` — Hub page (3 feature cards)
  - `/scan` — Label scanner
  - `/restaurant-scout` — Restaurant scout search + results
  - `/discover` — Discovery mode (cuisine + location search)
  - `/signin` — Email sign-in page
  - `/signout` — Sign out (redirects to hub)
  - `/my-safe-spots` — User's saved restaurants page
  - `/api/restaurant-scout` — POST, main restaurant analysis (with caching)
  - `/api/restaurant-scout/alternatives` — POST, find alternatives (cache-aware)
  - `/api/discover` — POST, discover restaurants by cuisine + location
  - `/api/save-restaurant` — POST, save restaurant to user's safe spots
  - `/api/unsave-restaurant` — POST, remove restaurant from safe spots
  - `/api/check-saved` — POST, check if restaurant is saved by user
  - `/api/join-waitlist` — POST, save email to waitlist table
  - `/api/request-restaurant` — POST, submit restaurant for async analysis
- **max_tokens:** Main scout = 10,000. Alternatives = 2,000. Discovery = 2,000.
- **Frontend:** Plain HTML/CSS/JS, no framework. Templates in `/templates/`. Mobile-first responsive.
- **Caching:** PostgreSQL, keyed on normalized name+location, 30-day TTL, upsert on conflict
- **Cost protection:** FREE_SEARCH_LIMIT = 5 (uncached searches only, cached are free). IP rate limit: 3 uncached searches/hour (in-memory dict).
- **New tables:** anonymous_usage (IP tracking), waitlist (Pro signups), restaurant_requests (async queue)

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
9. **Domain:** askcelia.com purchased (Squarespace, $20/year), connected to Render
10. **Discovery = lightweight first** — Returns list with brief notes + "Get Full Report" button, rather than full analysis of multiple restaurants at once. Cheaper, faster, funnels into cached scout.
11. **Launch city-first (likely Philly)** — Pre-populate local restaurants instead of chains. Celiacs need help with local spots more than chains that publish allergen guides. Expand city by city.
12. **Layered cost protection** — Cache → hourly IP rate limit → lifetime search limit → waitlist/request fallback. Every layer reduces exposure before opening to public.
13. **Request a Restaurant as bridge** — Free users who hit the limit can still request restaurants for async analysis. Creates upgrade pressure for Pro (instant results) while keeping users engaged.
14. **Haiku for lightweight tasks** — Discovery mode uses Haiku (5-7x cheaper) since it's just surfacing names, not doing deep analysis. Scout stays on Sonnet.
15. **Pre-cache as marketing investment** — 66 restaurants pre-cached (43 Philly, 20 national chains) so first-time users get instant results. ~$15-20 one-time cost.
16. **Free limit stays locked** — Joining waitlist does not reset the 5-search limit. Creates real upgrade pressure for Pro launch.
17. **Homepage search-first** — Search bar directly on homepage so users can search without navigating to a separate page. Reduces taps to first action from 2 to 0.
18. **Results page progressive disclosure** — Only score, Why It's Safe, and Things to Know shown by default. All other sections collapsed into expandable accordions. Reduces overwhelm while keeping depth accessible.

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
- ✅ Pre-populated 64 restaurants (43 Philly + 20 national chains + 1 extra) — all cached successfully across 3 runs
- ~~Add loading animation for first-time searches~~ ✅ Done early (Feb 7)
- ~~Improve search quality and ranking~~ ✅ Done early (Feb 7 — scoring rubric overhaul)
- ✅ Cost protection system (search limits, rate limiting, waitlist, request feature) — Done early Feb 11
- ✅ Smart Alternatives re-enabled with cache awareness — Feb 11
- ✅ Onboarding flow — 3 swipeable cards, Feb 17
- Share with 5-10 celiac beta testers
- Fix issues from testing

### Week 3: Accounts & Limits (Feb 19-25)
- ✅ Search limits + waitlist + request feature — Done early Feb 11
- Proper auth (Firebase/Supabase)
- Stripe integration ($7.99/month Pro)
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

- ~~**Smart alternatives** (re-enable after testing with caching)~~ ✅ Re-enabled Feb 11
- **Travel meal planner:** Pre-trip research, translation cards, airport/airline database
- **AI phone calling:** Premium feature for pre-order verification
- **Group dining mode:** "Suggest a Restaurant" text generator for group chats
- **Date mode:** Romantic, celiac-safe restaurant finder
- **Symptom tracker:** Log meals + symptoms, AI identifies triggers (future app, medical compliance concerns)
- **Streaming responses:** Stream Claude's response so results appear progressively instead of all at once (reduces perceived wait time)

---

## Business Model

- **Free tier:** 5 uncached restaurant searches (lifetime) + unlimited label scanning + unlimited cached results
  - After 5 searches: waitlist signup + request a restaurant (async, 24hr turnaround)
  - Phase 1 (current): Free with soft limits + waitlist to validate demand
  - Phase 2 (after 50+ waitlist emails): Add Stripe payments for Pro tier
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
- ✅ Full app rebrand to Celia complete (Feb 6)

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

### Feb 6 (continued - evening session 2)
- ✅ Redesigned restaurant results page - scannable layout with visual hierarchy
  - "Why It's Safe" section with bullet points
  - Menu highlights as cards (not buried in collapsible sections)
  - "Things to Know" warnings section
  - Expandable sections for call script and full analysis
- ✅ Redesigned homepage with better feature hierarchy
  - Bottom navigation bar (Home, Saved, Account)
  - Discover and Restaurant Scout as primary features (large cards)
  - Label Scanner as secondary utility (smaller, under "Quick Tools")
  - Cleaner header (removed cramped email display)
  - Account menu in bottom sheet modal
- ✅ Applied comprehensive design system
  - Warm gradient background (peachy to cream)
  - Clean pastel icon backgrounds (blue, peach, green)
  - Inter font family
  - Consistent spacing scale (8px, 12px, 16px, 24px, 32px, 48px)
  - Softer shadows and rounded corners
  - Professional, warm aesthetic
- ✅ Rebranded from GlutenGuard to Celia
  - Updated all templates and page titles
  - New tagline: "Your confident friend for dining out gluten-free"
  - Share functionality updated
- ✅ Fixed bugs:
  - "View Full Report" from My Safe Spots now auto-loads restaurant
  - JavaScript null checks prevent crashes on missing elements
  - Session handling improved
- 📋 UX is polished and ready for Week 2 (pre-population + user testing)
- 📋 Ready to deploy to Render with updated design

### Feb 7
- ✅ Scoring rubric overhaul — 5-tier system with hard rules (dedicated GF kitchen = min 9, certified = min 9, gluten-friendly only = max 6), positive/negative signals, instructions to not penalize for generic cuisine risks, not fabricate menu items, not include citation tags
- ✅ Score labels in UI — score_label displays under score circle with color coding, "What does this score mean?" expandable section
- ✅ Tested with Fox & Sons (dedicated GF) — scored 10, "Go with confidence"
- ✅ Improved cache key normalization — strips punctuation, normalizes &/and so variations hit same cache entry
- ✅ Step-by-step loading animation for uncached searches — header explaining first-time search, 5 timed steps with spinner to checkmark, 500ms delay so cache hits skip it
- ✅ 3 Reddit comments in r/Celiac (travel, university kitchen, newly diagnosed). Building presence before introducing Celia day 5-7.
- 💡 Twitter handle will be @celiaknows (rate limited today)
- 📋 Next session: Deploy to Render, then start pre-populating 50 Philly restaurants

### Feb 11
- ✅ Switched discovery mode to claude-haiku-4-5 (~5-7x cost reduction)
- ✅ Free search limit system: 5 uncached searches per user (email for signed-in, IP for anonymous)
- ✅ IP rate limiting: 3 uncached searches per hour per IP address
- ✅ Waitlist signup for Pro tier (shown when user hits search limit)
- ✅ Request a Restaurant feature (async analysis queue for limit-reached users)
- ✅ fulfill_requests.py batch script for processing restaurant requests
- ✅ prepopulate.py batch script for pre-caching restaurants
- ✅ Smart Alternatives re-enabled with cache-aware scoring
- ✅ Graceful fallback: rate-limited alternative scouts offer 'Request This Restaurant' instead of error
- ✅ Cleared stale restaurant cache (pre-Feb 7 entries with old scoring rubric)
- ✅ Database migration: added search_count column, anonymous_usage table, waitlist table, restaurant_requests table
- ✅ Fixed Render deploy config: starter plan, Python 3.10.2, runtime.txt, unpinned psycopg2-binary
- ✅ Pre-populated 64 restaurants (43 Philly + 20 national chains + 1 extra) — all cached successfully across 3 runs. 120-second delay needed between API calls to avoid rate limits.
- 💡 Strategic decisions: layered cost protection before Reddit launch, free limit stays locked (no reset on waitlist join), Phase 1 = free + waitlist to validate demand before adding Stripe
- 📋 Next session: verify prepopulate completed, commit all changes, deploy to Render, test live site

### Feb 17
- ✅ Cleaned up duplicate restaurant cache entries (removed 1 duplicate, 67 restaurants remain)
- ✅ Verified Vedge (4/10) and Moonbowls (4/10) scores are justified — no scoring rubric changes needed
- ✅ Built first-time visitor onboarding overlay (3 swipeable cards, localStorage flag, Skip button, arrow navigation, full-screen dark backdrop)
- ✅ Redesigned homepage — search bar front and center as primary action, Discover and Label Scanner as secondary/tertiary cards, social proof line with dynamic restaurant count from database
- ✅ Collapsed restaurant results page — only score card, Why It's Safe, and Things to Know shown by default, all other sections (Menu Highlights, Staff Knowledge, Call Script, Full Menu Analysis, Full Analysis, Community Reviews) collapsed into expandable accordions
- ✅ Deprioritized 'I Called — Answer Follow-up Questions' button (moved below collapsible sections, secondary style)
- ✅ Save/unsave button simplified to toggle pattern ('Saved ✓' / 'Save')
- ✅ Dynamic restaurant count on homepage (pulls from database, updates automatically)
- ✅ Title case applied to restaurant names in display
- ✅ Removed /reset-onboarding test route
- ✅ Fixed flash of search form on scout page when arriving with query params
- ✅ Upgraded Render to Starter plan ($7/month)
- ✅ Set SECRET_KEY environment variable on Render
- ✅ Purchased askcelia.com domain (Squarespace, $20/year)
- ✅ Connected askcelia.com to Render (DNS verified, SSL certificate pending)
- ✅ Deployed all changes to Render (auto-deploy from git push)
- 📋 Next session: verify askcelia.com is live with SSL, smoke test the live site, plan beta testing and Reddit launch
