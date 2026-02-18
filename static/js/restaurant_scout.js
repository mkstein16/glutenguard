const $ = (sel) => document.querySelector(sel);
const show = (el) => { if (el) el.classList.remove("hidden"); };
const hide = (el) => { if (el) el.classList.add("hidden"); };
const titleCase = (s) => s.replace(/\b\w/g, (c) => c.toUpperCase());

// Elements
const restaurantNameInput = $("#restaurant-name");
const menuUrlInput = $("#menu-url");
const scoutBtn = $("#scout-btn");
const searchView = $("#search-view");
const scoutLoading = $("#scout-loading");
const scoutResults = $("#scout-results");
const locationInput = $("#scout-location");

// Pre-fill location from localStorage
const savedLocation = localStorage.getItem("celia_last_location");
if (savedLocation && locationInput && !locationInput.value) {
  locationInput.value = savedLocation;
}

// State
let currentScoutResult = null;
let currentLocation = "";
let loadingTimer = null;
let stepInterval = null;
let currentStep = 0;
const limitReachedView = $("#limit-reached-view");

function startLoadingSteps() {
  const steps = document.querySelectorAll(".loading-step");
  const header = document.querySelector(".loading-header");
  currentStep = 0;

  // 500ms delay — cache hits resolve before this fires
  loadingTimer = setTimeout(() => {
    header.classList.add("visible");
    steps[0].classList.add("active");

    stepInterval = setInterval(() => {
      currentStep++;
      if (currentStep < steps.length) {
        steps[currentStep - 1].classList.remove("active");
        steps[currentStep - 1].classList.add("done");
        steps[currentStep].classList.add("active");
      } else {
        clearInterval(stepInterval);
        stepInterval = null;
      }
    }, 8000);
  }, 500);
}

function stopLoadingSteps() {
  if (loadingTimer) {
    clearTimeout(loadingTimer);
    loadingTimer = null;
  }
  if (stepInterval) {
    clearInterval(stepInterval);
    stepInterval = null;
  }
  // Reset for next search
  document.querySelector(".loading-header").classList.remove("visible");
  document.querySelectorAll(".loading-step").forEach((step) => {
    step.classList.remove("active", "done");
  });
}

// ---------------------------------------------------------------------------
// Scout Search
// ---------------------------------------------------------------------------

if (scoutBtn) {
  scoutBtn.addEventListener("click", async () => {
    const name = restaurantNameInput.value.trim();
    if (!name) {
      restaurantNameInput.focus();
      return;
    }

    const menuUrl = menuUrlInput ? menuUrlInput.value.trim() : "";
    currentLocation = locationInput ? locationInput.value.trim() : "";
    if (currentLocation) localStorage.setItem("celia_last_location", currentLocation);

    hide(searchView);
    show(scoutLoading);
    startLoadingSteps();

    try {
      const response = await fetch("/api/restaurant-scout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ restaurant_name: name, menu_url: menuUrl, location: currentLocation }),
      });

      const data = await response.json();

      if (!response.ok) {
        if (data.limit_reached) {
          stopLoadingSteps();
          hide(scoutLoading);
          showLimitReached();
          return;
        }
        throw new Error(data.error || "Scout failed");
      }

      currentScoutResult = data;
      displayScoutResults(data);
    } catch (err) {
      alert(err.message || "Something went wrong. Please try again.");
      resetToSearch();
    } finally {
      stopLoadingSteps();
      hide(scoutLoading);
    }
  });
}

// Allow Enter key on restaurant name input
if (restaurantNameInput) {
  restaurantNameInput.addEventListener("keydown", (e) => {
    if (e.key === "Enter") {
      e.preventDefault();
      if (scoutBtn) scoutBtn.click();
    }
  });
}

// ---------------------------------------------------------------------------
// Display Scout Results
// ---------------------------------------------------------------------------

function displayScoutResults(data) {
  const a = data.analysis;

  // === HERO CARD ===
  const scoreRing = $("#safety-score-ring");
  scoreRing.textContent = a.safety_score;
  scoreRing.className = "score-ring " + getScoreClass(a.safety_score);

  const scoreLabel = $("#score-label");
  scoreLabel.textContent = a.score_label || "";
  scoreLabel.className = "score-label " + getScoreLabelColor(a.safety_score);

  // Score context line
  const scoreContext = $("#score-context");
  if (scoreContext) {
    const s = a.safety_score || 0;
    if (s >= 9) scoreContext.textContent = "Safe for nearly all celiacs \u2014 dedicated or certified kitchen";
    else if (s >= 7) scoreContext.textContent = "Safe for most celiacs with standard precautions";
    else if (s >= 5) scoreContext.textContent = "May be workable but requires careful communication";
    else if (s >= 3) scoreContext.textContent = "Significant cross-contamination risks present";
    else scoreContext.textContent = "Not recommended for celiac diners";
  }

  const label = $("#safety-label");
  label.textContent = a.score_label || "";
  label.className = "safety-label-badge " + getScoreClass(a.safety_score);

  $("#scout-restaurant-name").textContent = titleCase(a.restaurant_name);
  $("#scout-cuisine").textContent = a.cuisine_type + (currentLocation ? " · " + currentLocation : "");
  $("#scout-summary").textContent = a.summary;

  // === WHY IT'S SAFE Section ===
  const specPositives = a.this_restaurant ? a.this_restaurant.specific_positives || [] : [];
  const safetyIndicators = $("#safety-indicators");
  const safetyList = $("#safety-indicators-list");

  // Dynamic heading based on safety score
  const safetyHeading = $("#safety-indicators-heading");
  if (safetyHeading) {
    const score = a.safety_score || 0;
    if (score >= 7) {
      safetyHeading.textContent = "Why It's Safe";
    } else if (score >= 5) {
      safetyHeading.textContent = "What's in Its Favor";
    } else {
      safetyHeading.textContent = "Claimed Positives";
    }
  }

  if (specPositives.length > 0) {
    safetyList.innerHTML = "";
    // Show up to 5 indicators
    specPositives.slice(0, 5).forEach((text) => {
      const li = document.createElement("li");
      li.textContent = text;
      safetyList.appendChild(li);
    });
    show(safetyIndicators);
  } else {
    hide(safetyIndicators);
  }

  // === MENU HIGHLIGHTS Section ===
  const menu = a.menu_analysis || { likely_safe: [], ask_first: [], red_flags: [] };
  const menuHighlights = $("#menu-highlights");
  const menuPills = $("#menu-pills");
  const seeAllBtn = $("#see-all-menu-btn");

  menuPills.innerHTML = "";
  const safeItems = menu.likely_safe || [];

  if (safeItems.length > 0) {
    // Show up to 6 items as pills
    const displayItems = safeItems.slice(0, 6);
    displayItems.forEach((item) => {
      const pill = document.createElement("span");
      pill.className = "menu-pill";
      pill.innerHTML = escapeHtml(item.item);
      menuPills.appendChild(pill);
    });

    // Show "See all" if more than 6
    if (safeItems.length > 6) {
      seeAllBtn.textContent = `See all safe items (${safeItems.length})`;
      show(seeAllBtn);
    } else {
      hide(seeAllBtn);
    }

    show(menuHighlights);
  } else {
    hide(menuHighlights);
  }

  // === THINGS TO KNOW Section (conditional) ===
  const specRisks = a.this_restaurant ? a.this_restaurant.specific_risks || [] : [];
  const askItems = menu.ask_first || [];
  const redFlags = menu.red_flags || [];
  const thingsToKnow = $("#things-to-know");
  const thingsToKnowList = $("#things-to-know-list");

  // Combine risks and notable items to ask about
  const warnings = [...specRisks];
  if (askItems.length > 0) {
    warnings.push(`Ask about: ${askItems.slice(0, 3).map(i => i.item).join(", ")}`);
  }
  if (redFlags.length > 0) {
    warnings.push(`Avoid: ${redFlags.slice(0, 2).map(i => i.item).join(", ")}`);
  }

  if (warnings.length > 0) {
    thingsToKnowList.innerHTML = "";
    warnings.slice(0, 4).forEach((text) => {
      const li = document.createElement("li");
      li.textContent = text;
      thingsToKnowList.appendChild(li);
    });
    show(thingsToKnow);
  } else {
    hide(thingsToKnow);
  }

  // === STAFF KNOWLEDGE ===
  const staffRaw = a.this_restaurant ? a.this_restaurant.staff_knowledge || "UNKNOWN" : "UNKNOWN";
  // staff_knowledge can be a long string like "LOW - explanation here" or just "HIGH"
  const staffDash = staffRaw.indexOf(" - ");
  const staffLevel = staffDash > -1 ? staffRaw.substring(0, staffDash).trim() : staffRaw.trim();
  const staffExplanation = staffDash > -1 ? staffRaw.substring(staffDash + 3).trim() : "";
  const staffCard = $("#staff-knowledge-card");
  const staffBadge = $("#staff-knowledge-badge");
  const staffDetail = $("#staff-knowledge-detail");
  staffBadge.textContent = staffLevel;
  staffBadge.className = "staff-badge staff-" + staffLevel.toLowerCase();
  if (staffDetail) {
    staffDetail.textContent = staffExplanation || {
      "HIGH": "Staff are well-trained on celiac/gluten-free needs and can guide you through the menu.",
      "MODERATE": "Staff have some awareness of gluten-free needs but may need prompting on specifics.",
      "LOW": "Staff have limited knowledge of gluten-free requirements. Be prepared to ask detailed questions.",
    }[staffLevel] || "";
  }
  if (staffLevel !== "UNKNOWN") {
    show(staffCard);
  } else {
    hide(staffCard);
  }

  // === EXPANDABLE SECTIONS ===

  // Full Menu Analysis
  populateMenuList($("#likely-safe-list"), menu.likely_safe);
  $("#safe-count").textContent = menu.likely_safe.length ? `(${menu.likely_safe.length})` : "";

  populateMenuList($("#ask-first-list"), menu.ask_first);
  $("#ask-count").textContent = menu.ask_first.length ? `(${menu.ask_first.length})` : "";

  populateMenuList($("#red-flags-list"), menu.red_flags);
  $("#flags-count").textContent = menu.red_flags.length ? `(${menu.red_flags.length})` : "";

  // Full Analysis
  $("#research-summary").textContent = a.research_summary || "No research summary available.";

  const cuisine = a.cuisine_context || { general_risks: [], general_positives: [] };
  populateStringList($("#cuisine-general-risks"), cuisine.general_risks);
  populateStringList($("#cuisine-general-positives"), cuisine.general_positives);

  // Community Reviews
  $("#community-sentiment").textContent = a.community_sentiment || "No celiac-specific community reviews found for this restaurant.";

  // Call Script
  const callHeading = $("#call-script-heading");
  if (callHeading) {
    callHeading.textContent = "What to Ask " + titleCase(a.restaurant_name);
  }
  $("#call-script-context").textContent = a.call_script_context || "";
  renderCallScript(a.call_script || []);

  // Reset alternatives
  hide($("#alternatives-section"));
  hide($("#alternatives-loading"));
  hide($("#alternatives-results"));
  $("#alternatives-list").innerHTML = "";

  // Show "Find Better Options" button if score < 7 and location provided
  const findAltBtn = $("#find-alternatives-btn");
  if (a.safety_score < 7 && currentLocation) {
    show(findAltBtn);
    findAltBtn.disabled = false;
    findAltBtn.textContent = "Find Better Options Nearby";
  } else {
    hide(findAltBtn);
  }

  // Check if restaurant is already saved and update button
  checkSavedStatus();

  show(scoutResults);
}

function toggleSection(el, visible) {
  if (visible) show(el);
  else hide(el);
}

function getScoreClass(score) {
  if (score >= 9) return "very-low-risk";
  if (score >= 7) return "low-risk";
  if (score >= 5) return "moderate-risk";
  if (score >= 3) return "high-risk";
  return "very-high-risk";
}

function getScoreLabelColor(score) {
  if (score >= 9) return "label-green";
  if (score >= 7) return "label-amber";
  if (score >= 5) return "label-orange";
  return "label-red";
}

function populateMenuList(ul, items) {
  ul.innerHTML = "";
  (items || []).forEach((item) => {
    const li = document.createElement("li");
    li.innerHTML = `<strong>${escapeHtml(item.item)}</strong><span class="menu-note">${escapeHtml(item.note)}</span>`;
    ul.appendChild(li);
  });
}

function populateStringList(ul, items) {
  ul.innerHTML = "";
  (items || []).forEach((text) => {
    const li = document.createElement("li");
    li.textContent = text;
    ul.appendChild(li);
  });
}

// ---------------------------------------------------------------------------
// Call Script Rendering
// ---------------------------------------------------------------------------

function normalizeCallScript(callScript) {
  return callScript.map((item) => {
    if (typeof item === "string") {
      return { question: item, priority: "essential" };
    }
    return item;
  });
}

function renderCallScript(callScript) {
  const items = normalizeCallScript(callScript);
  const scriptList = $("#call-script-list");
  const toggle = $("#show-additional-toggle");
  scriptList.innerHTML = "";

  const savedPrefs = loadScriptPrefs(items.length);

  items.forEach((item, idx) => {
    const li = document.createElement("li");
    li.className = "script-item";
    if (item.priority === "additional") {
      li.classList.add("additional", "script-hidden");
    }

    const isChecked = savedPrefs ? savedPrefs[idx] : true;

    li.innerHTML = `
      <label class="script-check">
        <input type="checkbox" data-idx="${idx}" ${isChecked ? "checked" : ""}>
        <span class="script-question">${escapeHtml(item.question)}</span>
        <span class="priority-tag priority-${item.priority}">${item.priority}</span>
      </label>
    `;
    scriptList.appendChild(li);
  });

  // Toggle handler
  const hasAdditional = items.some((i) => i.priority === "additional");
  if (hasAdditional) {
    show(toggle);
    toggle.textContent = "Show All Questions";
    toggle.onclick = () => {
      const additionalItems = scriptList.querySelectorAll(".additional");
      const isHidden = additionalItems[0]?.classList.contains("script-hidden");
      additionalItems.forEach((el) => {
        if (isHidden) el.classList.remove("script-hidden");
        else el.classList.add("script-hidden");
      });
      toggle.textContent = isHidden ? "Show Essential Only" : "Show All Questions";
      // Update preset active state
      updatePresetState(isHidden ? "thorough" : "quick");
    };
  } else {
    hide(toggle);
  }

  // Checkbox change -> save prefs
  scriptList.addEventListener("change", () => {
    saveScriptPrefs(items.length);
  });

  // Presets
  updatePresetState("quick");
}

function updatePresetState(preset) {
  document.querySelectorAll(".preset-btn").forEach((btn) => {
    btn.classList.toggle("active", btn.dataset.preset === preset);
  });
}

// Preset buttons
document.querySelectorAll(".preset-btn").forEach((btn) => {
  btn.addEventListener("click", () => {
    const preset = btn.dataset.preset;
    const scriptList = $("#call-script-list");
    const toggle = $("#show-additional-toggle");
    const additionalItems = scriptList.querySelectorAll(".additional");

    if (preset === "thorough") {
      additionalItems.forEach((el) => el.classList.remove("script-hidden"));
      scriptList.querySelectorAll('input[type="checkbox"]').forEach((cb) => { cb.checked = true; });
      toggle.textContent = "Show Essential Only";
    } else {
      additionalItems.forEach((el) => el.classList.add("script-hidden"));
      scriptList.querySelectorAll('input[type="checkbox"]').forEach((cb) => {
        const li = cb.closest(".script-item");
        cb.checked = !li.classList.contains("additional");
      });
      toggle.textContent = "Show All Questions";
    }

    updatePresetState(preset);
    saveScriptPrefs(scriptList.querySelectorAll(".script-item").length);
  });
});

function saveScriptPrefs(count) {
  const checks = [];
  document.querySelectorAll("#call-script-list input[type='checkbox']").forEach((cb) => {
    checks.push(cb.checked);
  });
  try {
    localStorage.setItem("glutenguard_script_prefs", JSON.stringify({ count, checks }));
  } catch (e) { /* ignore */ }
}

function loadScriptPrefs(count) {
  try {
    const raw = localStorage.getItem("glutenguard_script_prefs");
    if (!raw) return null;
    const prefs = JSON.parse(raw);
    if (prefs.count !== count) return null;
    return prefs.checks;
  } catch (e) {
    return null;
  }
}

// ---------------------------------------------------------------------------
// Save Restaurant (legacy handler - may be overridden below)
// ---------------------------------------------------------------------------

const legacySaveBtn = $("#save-restaurant-btn");
if (legacySaveBtn) {
  legacySaveBtn.addEventListener("click", async () => {
    const btn = $("#save-restaurant-btn");
    if (!btn || btn.classList.contains("saved")) return;

    try {
      const response = await fetch("/api/restaurant-scout/save", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: currentScoutResult.id,
          restaurant_name: currentScoutResult.restaurant_name,
          analysis: currentScoutResult.analysis,
          final_report: currentScoutResult.final_report,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "Save failed");
      }

      btn.textContent = "Saved!";
      btn.classList.add("saved");
      btn.disabled = true;
    } catch (err) {
      alert(err.message || "Failed to save. Please try again.");
    }
  });
}

// ---------------------------------------------------------------------------
// Sharing
// ---------------------------------------------------------------------------

function generateShareText(data) {
  const a = data.analysis;
  let text = `Celia Report: ${titleCase(a.restaurant_name)} (${a.cuisine_type})`;
  text += ` - Safety Score: ${a.safety_score}/10 ${a.score_label}.`;
  text += ` ${a.summary}`;
  const menu = a.menu_analysis || {};
  if (menu.likely_safe?.length) {
    text += ` Menu highlights: ${menu.likely_safe.map((i) => i.item).join(", ")}.`;
  }
  if (menu.ask_first?.length) {
    text += ` Ask about: ${menu.ask_first.map((i) => i.item).join(", ")}.`;
  }
  if (menu.red_flags?.length) {
    text += ` Avoid: ${menu.red_flags.map((i) => i.item).join(", ")}.`;
  }
  return text;
}

async function shareReport(text, feedbackEl) {
  try {
    if (navigator.share) {
      await navigator.share({ text });
      return;
    }
  } catch (e) {
    // User cancelled or share failed, fall through to clipboard
  }

  try {
    await navigator.clipboard.writeText(text);
  } catch (e) {
    // Final fallback: hidden textarea
    const ta = document.createElement("textarea");
    ta.value = text;
    ta.style.position = "fixed";
    ta.style.opacity = "0";
    document.body.appendChild(ta);
    ta.select();
    document.execCommand("copy");
    document.body.removeChild(ta);
  }

  show(feedbackEl);
  setTimeout(() => hide(feedbackEl), 2500);
}

const shareResultsBtn = $("#share-results-btn");
if (shareResultsBtn) {
  shareResultsBtn.addEventListener("click", () => {
    if (!currentScoutResult) return;
    const text = generateShareText(currentScoutResult);
    shareReport(text, $("#share-results-feedback"));
  });
}


// ---------------------------------------------------------------------------
// Smart Alternatives
// ---------------------------------------------------------------------------

const findAlternativesBtn = $("#find-alternatives-btn");
if (findAlternativesBtn) {
  findAlternativesBtn.addEventListener("click", () => {
    if (!currentScoutResult) return;
    const a = currentScoutResult.analysis;
    const btn = $("#find-alternatives-btn");
    if (!btn) return;
    btn.disabled = true;
    btn.textContent = "Searching...";
    fetchAlternatives(a.cuisine_type, currentLocation, a.restaurant_name);
  });
}

async function fetchAlternatives(cuisineType, location, originalName) {
  const altSection = $("#alternatives-section");
  const altLoading = $("#alternatives-loading");
  const altResults = $("#alternatives-results");
  const altList = $("#alternatives-list");
  const findBtn = $("#find-alternatives-btn");

  show(altSection);
  show(altLoading);
  hide(altResults);

  try {
    const response = await fetch("/api/restaurant-scout/alternatives", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        cuisine_type: cuisineType,
        location: location,
        original_restaurant_name: originalName,
      }),
    });

    if (!response.ok) {
      hide(altSection);
      findBtn.disabled = false;
      findBtn.textContent = "Find Better Options Nearby";
      return;
    }

    const data = await response.json();
    const alternatives = data.alternatives || [];

    if (alternatives.length === 0) {
      hide(altSection);
      findBtn.textContent = "No alternatives found";
      findBtn.disabled = true;
      return;
    }

    hide(findBtn);

    altList.innerHTML = "";
    alternatives.forEach((alt) => {
      const card = document.createElement("div");
      card.className = "alternative-card";

      const scoreClass = getScoreClass(alt.estimated_safety_score);

      card.innerHTML = `
        <div class="score-ring ${scoreClass}" style="width:48px;height:48px;font-size:18px;border-width:3px;flex-shrink:0;">
          ${alt.estimated_safety_score}
        </div>
        <div class="alt-info">
          <div class="alt-name">${escapeHtml(titleCase(alt.name))}</div>
          <div class="alt-cuisine">${escapeHtml(alt.cuisine || "")}${alt.location_note ? " \u00b7 " + escapeHtml(alt.location_note) : ""}</div>
          <div class="alt-reason">${escapeHtml(alt.brief_reason)}</div>
        </div>
        <button class="alt-scout-btn btn btn-secondary">Scout</button>
      `;

      card.querySelector(".alt-scout-btn").addEventListener("click", async () => {
        const btn = card.querySelector(".alt-scout-btn");
        btn.disabled = true;
        btn.textContent = "Scouting...";

        try {
          const resp = await fetch("/api/restaurant-scout", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ restaurant_name: alt.name, menu_url: "", location }),
          });
          const data = await resp.json();

          if (!resp.ok) {
            // Rate limit or other error — offer to request instead
            const info = card.querySelector(".alt-info");
            info.innerHTML = `
              <div class="alt-name">${escapeHtml(titleCase(alt.name))}</div>
              <p style="font-size:13px;color:var(--text-secondary);margin:6px 0;">
                We can't scout this one right now. Want us to analyze it for you?
              </p>
            `;
            btn.textContent = "Request This Restaurant";
            btn.disabled = false;
            btn.onclick = async () => {
              btn.disabled = true;
              btn.textContent = "Requesting...";
              try {
                await fetch("/api/request-restaurant", {
                  method: "POST",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({ restaurant_name: alt.name, location }),
                });
                btn.textContent = "Requested!";
              } catch (_) {
                btn.textContent = "Failed — try again";
                btn.disabled = false;
              }
            };
            return;
          }

          // Success — navigate to full results
          currentScoutResult = data;
          currentLocation = location;
          displayScoutResults(data);
        } catch (err) {
          btn.textContent = "Scout";
          btn.disabled = false;
          alert(err.message || "Something went wrong. Please try again.");
        }
      });

      altList.appendChild(card);
    });

    hide(altLoading);
    show(altResults);
  } catch (e) {
    hide(altSection);
    findBtn.disabled = false;
    findBtn.textContent = "Find Better Options Nearby";
  }
}

// ---------------------------------------------------------------------------
// Navigation Helpers
// ---------------------------------------------------------------------------

function resetToSearch() {
  if (restaurantNameInput) restaurantNameInput.value = "";
  if (menuUrlInput) menuUrlInput.value = "";
  if (locationInput) {
    locationInput.value = localStorage.getItem("celia_last_location") || "";
  }
  currentScoutResult = null;
  currentLocation = "";
  isCurrentRestaurantSaved = false;
  if (scoutResults) hide(scoutResults);
  if (scoutLoading) hide(scoutLoading);
  const altSection = $("#alternatives-section");
  if (altSection) hide(altSection);
  const findAltBtn = $("#find-alternatives-btn");
  if (findAltBtn) hide(findAltBtn);
  if (searchView) show(searchView);
}

const newScoutBtn = $("#new-scout-btn");
if (newScoutBtn) newScoutBtn.addEventListener("click", resetToSearch);

// "See all menu items" button opens the full menu section
const seeAllMenuBtn = $("#see-all-menu-btn");
if (seeAllMenuBtn) {
  seeAllMenuBtn.addEventListener("click", () => {
    const fullMenuSection = $("#full-menu-section");
    if (fullMenuSection) {
      fullMenuSection.open = true;
      fullMenuSection.scrollIntoView({ behavior: "smooth", block: "start" });
    }
  });
}

// ---------------------------------------------------------------------------
// Utilities
// ---------------------------------------------------------------------------

function escapeHtml(str) {
  const div = document.createElement("div");
  div.textContent = str;
  return div.innerHTML;
}

// ---------------------------------------------------------------------------
// Save Restaurant
// ---------------------------------------------------------------------------

// Track whether current restaurant is saved
let isCurrentRestaurantSaved = false;

async function checkSavedStatus() {
  const saveBtn = $("#save-restaurant-btn");
  if (!saveBtn || !currentScoutResult) return;

  const feedback = $("#save-feedback");
  hide(feedback);

  try {
    // Build request body - prefer restaurant_id if available
    const requestBody = {};
    if (currentScoutResult.restaurant_id) {
      requestBody.restaurant_id = currentScoutResult.restaurant_id;
    } else {
      requestBody.name = currentScoutResult.analysis.restaurant_name;
      requestBody.location = currentLocation;
    }

    const response = await fetch("/api/check-saved", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(requestBody),
    });

    const data = await response.json();
    isCurrentRestaurantSaved = data.saved;
    updateSaveButtonState(saveBtn);
  } catch (e) {
    // Ignore errors, leave button in default state
    isCurrentRestaurantSaved = false;
    updateSaveButtonState(saveBtn);
  }
}

function updateSaveButtonState(btn) {
  if (!btn) return;

  btn.disabled = false;

  const bookmarkSvg = '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z"/></svg>';
  if (isCurrentRestaurantSaved) {
    btn.innerHTML = bookmarkSvg + ' <span>Saved ✓</span>';
    btn.classList.add("saved");
    btn.classList.add("unsave-mode");
  } else {
    btn.innerHTML = bookmarkSvg + ' <span>Save</span>';
    btn.classList.remove("saved");
    btn.classList.remove("unsave-mode");
  }
}

const saveRestaurantBtn = $("#save-restaurant-btn");
if (saveRestaurantBtn) {
  saveRestaurantBtn.addEventListener("click", async () => {
    if (!currentScoutResult || saveRestaurantBtn.disabled) return;

    const feedback = $("#save-feedback");
    const shareFeedback = $("#share-feedback");

    // Hide any existing feedback
    hide(feedback);
    hide(shareFeedback);

    saveRestaurantBtn.disabled = true;

    // Build request body - prefer restaurant_id if available
    const requestBody = {};
    if (currentScoutResult.restaurant_id) {
      requestBody.restaurant_id = currentScoutResult.restaurant_id;
    } else {
      requestBody.name = currentScoutResult.analysis.restaurant_name;
      requestBody.location = currentLocation;
    }

    if (isCurrentRestaurantSaved) {
      // UNSAVE flow
      saveRestaurantBtn.innerHTML = '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z"/></svg> Removing...';

      try {
        const response = await fetch("/api/unsave-restaurant", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(requestBody),
        });

        const data = await response.json();

        if (response.ok && data.success) {
          isCurrentRestaurantSaved = false;
          updateSaveButtonState(saveRestaurantBtn);
          feedback.textContent = "Removed from Safe Spots";
          feedback.classList.remove("error");
          show(feedback);
          setTimeout(() => hide(feedback), 2500);
        } else {
          throw new Error(data.error || "Failed to remove");
        }
      } catch (e) {
        updateSaveButtonState(saveRestaurantBtn);
        feedback.textContent = e.message || "Failed to remove. Try again.";
        feedback.classList.add("error");
        show(feedback);
      }
    } else {
      // SAVE flow
      saveRestaurantBtn.innerHTML = '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z"/></svg> Saving...';

      try {
        const response = await fetch("/api/save-restaurant", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(requestBody),
        });

        const data = await response.json();

        if (response.ok && data.success) {
          isCurrentRestaurantSaved = true;
          updateSaveButtonState(saveRestaurantBtn);
          feedback.textContent = data.already_saved ? "Already in Safe Spots" : "Saved to Safe Spots!";
          feedback.classList.remove("error");
          show(feedback);
          setTimeout(() => hide(feedback), 2500);
        } else {
          throw new Error(data.error || "Save failed");
        }
      } catch (e) {
        updateSaveButtonState(saveRestaurantBtn);
        feedback.textContent = e.message || "Failed to save. Try again.";
        feedback.classList.add("error");
        show(feedback);
      }
    }
  });
}

// ---------------------------------------------------------------------------
// Share Report
// ---------------------------------------------------------------------------

const shareReportBtn = $("#share-report-btn");
if (shareReportBtn) {
  shareReportBtn.addEventListener("click", async () => {
    if (!currentScoutResult) return;

    const feedback = $("#share-feedback");
    const saveFeedback = $("#save-feedback");

    // Hide any existing feedback
    hide(saveFeedback);
    hide(feedback);

    const analysis = currentScoutResult.analysis;
    // Use the original search term for cache-friendly URLs, fall back to Claude's name
    const searchName = currentScoutResult.restaurant_name || analysis.restaurant_name;
    const displayName = titleCase(analysis.restaurant_name);
    const safetyScore = analysis.safety_score;
    const safetyLabel = analysis.score_label;

    // Build shareable URL using original search term (matches cache key)
    const shareUrl = new URL("/restaurant-scout", window.location.origin);
    shareUrl.searchParams.set("name", searchName);
    if (currentLocation) {
      shareUrl.searchParams.set("location", currentLocation);
    }

    const shareTitle = `${displayName} - Celiac Safety Report`;
    const shareText = `Check out this celiac safety report for ${displayName}. Safety Score: ${safetyScore}/10 (${safetyLabel})`;

    // Try native share first (mobile)
    if (navigator.share) {
      try {
        await navigator.share({
          title: shareTitle,
          text: shareText,
          url: shareUrl.toString(),
        });
        // Native share was successful (or cancelled) - no feedback needed
        return;
      } catch (err) {
        // User cancelled or share failed - fall through to clipboard
        if (err.name === "AbortError") {
          return; // User cancelled, do nothing
        }
      }
    }

    // Fallback: Copy to clipboard
    try {
      await navigator.clipboard.writeText(shareUrl.toString());
      feedback.textContent = "Link copied to clipboard!";
      feedback.classList.remove("error");
      feedback.classList.add("share-success");
      show(feedback);
      setTimeout(() => hide(feedback), 3000);
    } catch (err) {
      // Final fallback: textarea copy
      try {
        const textarea = document.createElement("textarea");
        textarea.value = shareUrl.toString();
        textarea.style.position = "fixed";
        textarea.style.opacity = "0";
        document.body.appendChild(textarea);
        textarea.select();
        document.execCommand("copy");
        document.body.removeChild(textarea);

        feedback.textContent = "Link copied to clipboard!";
        feedback.classList.remove("error");
        feedback.classList.add("share-success");
        show(feedback);
        setTimeout(() => hide(feedback), 3000);
      } catch (e) {
        feedback.textContent = "Could not copy link";
        feedback.classList.add("error");
        feedback.classList.remove("share-success");
        show(feedback);
      }
    }
  });
}

// ---------------------------------------------------------------------------
// Search Limit Reached
// ---------------------------------------------------------------------------

function showLimitReached() {
  hide(searchView);
  hide(scoutResults);
  show(limitReachedView);
}

const waitlistForm = $("#waitlist-form");
if (waitlistForm) {
  waitlistForm.addEventListener("submit", async (e) => {
    e.preventDefault();
    const emailInput = $("#waitlist-email");
    const email = emailInput.value.trim();
    if (!email) return;

    try {
      const response = await fetch("/api/join-waitlist", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      });

      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error || "Failed to join waitlist");
      }

      hide(waitlistForm);
      show($("#waitlist-success"));
    } catch (err) {
      alert(err.message || "Something went wrong. Please try again.");
    }
  });
}

// ---------------------------------------------------------------------------
// Restaurant Request Form
// ---------------------------------------------------------------------------

const requestForm = $("#request-restaurant-form");
if (requestForm) {
  requestForm.addEventListener("submit", async (e) => {
    e.preventDefault();
    const name = $("#request-restaurant-name").value.trim();
    if (!name) return;

    const location = $("#request-restaurant-location").value.trim();

    try {
      const response = await fetch("/api/request-restaurant", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ restaurant_name: name, location }),
      });

      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error || "Failed to submit request");
      }

      hide(requestForm);
      show($("#request-success"));
    } catch (err) {
      alert(err.message || "Something went wrong. Please try again.");
    }
  });
}

// ---------------------------------------------------------------------------
// URL Parameter Handling (for links from My Safe Spots and Discover pages)
// ---------------------------------------------------------------------------

function initFromUrlParams() {
  console.log("[Scout] initFromUrlParams called");
  console.log("[Scout] Current URL:", window.location.href);

  const params = new URLSearchParams(window.location.search);
  const name = params.get("name");
  const location = params.get("location");

  console.log("[Scout] URL params - name:", name, "location:", location);
  console.log("[Scout] restaurantNameInput element:", restaurantNameInput);
  console.log("[Scout] locationInput element:", locationInput);
  console.log("[Scout] scoutBtn element:", scoutBtn);

  if (name) {
    console.log("[Scout] Name param found, setting up auto-search");

    // Replace inline display:none (from template) with class-based hiding
    if (searchView) {
      searchView.style.display = "";
      hide(searchView);
    }

    // Set form values
    if (restaurantNameInput) {
      restaurantNameInput.value = name;
      console.log("[Scout] Set restaurant name input to:", name);
    } else {
      console.error("[Scout] ERROR: restaurantNameInput is null!");
      return;
    }

    if (location && locationInput) {
      locationInput.value = location;
      console.log("[Scout] Set location input to:", location);
    }

    // Clear URL params without triggering reload
    window.history.replaceState({}, "", window.location.pathname);
    console.log("[Scout] Cleared URL params");

    // Auto-trigger search
    if (scoutBtn) {
      console.log("[Scout] Triggering search in 150ms...");
      setTimeout(() => {
        console.log("[Scout] NOW triggering scoutBtn.click()");
        scoutBtn.click();
      }, 150);
    } else {
      console.error("[Scout] ERROR: scoutBtn is null!");
    }
  } else {
    console.log("[Scout] No name param in URL, skipping auto-search");
  }
}

// Run on DOMContentLoaded to ensure all elements are ready
if (document.readyState === "loading") {
  console.log("[Scout] Document still loading, adding DOMContentLoaded listener");
  document.addEventListener("DOMContentLoaded", initFromUrlParams);
} else {
  console.log("[Scout] Document already loaded, running initFromUrlParams directly");
  initFromUrlParams();
}
