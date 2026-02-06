const $ = (sel) => document.querySelector(sel);
const show = (el) => el.classList.remove("hidden");
const hide = (el) => el.classList.add("hidden");

// Elements
const restaurantNameInput = $("#restaurant-name");
const menuUrlInput = $("#menu-url");
const scoutBtn = $("#scout-btn");
const searchView = $("#search-view");
const scoutLoading = $("#scout-loading");
const scoutResults = $("#scout-results");
const questionnaireView = $("#questionnaire-view");
const questionnaireLoading = $("#questionnaire-loading");
const finalReportView = $("#final-report-view");
const savedToggle = $("#saved-toggle");
const savedView = $("#saved-view");
const savedClose = $("#saved-close");
const savedList = $("#saved-list");
const savedEmpty = $("#saved-empty");

const locationInput = $("#scout-location");

// State
let currentScoutResult = null;
let currentLocation = "";

// Questionnaire questions
const questionnaireQuestions = [
  { id: "knows_celiac", text: "Did they know what celiac disease is?" },
  { id: "dedicated_fryer", text: "Do they have a dedicated gluten-free fryer?" },
  { id: "change_gloves", text: "Will they change gloves for your order?" },
  { id: "separate_prep", text: "Do they have a separate prep area or clean surfaces?" },
  { id: "confident_answers", text: "Did the staff seem confident and knowledgeable?" },
  { id: "gf_menu", text: "Do they have a gluten-free menu or marked items?" },
  { id: "willing_to_accommodate", text: "Were they willing to make modifications?" },
];

// ---------------------------------------------------------------------------
// Scout Search
// ---------------------------------------------------------------------------

scoutBtn.addEventListener("click", async () => {
  const name = restaurantNameInput.value.trim();
  if (!name) {
    restaurantNameInput.focus();
    return;
  }

  const menuUrl = menuUrlInput.value.trim();
  currentLocation = locationInput.value.trim();

  hide(searchView);
  show(scoutLoading);

  try {
    const response = await fetch("/api/restaurant-scout", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ restaurant_name: name, menu_url: menuUrl, location: currentLocation }),
    });

    const data = await response.json();

    if (!response.ok) {
      throw new Error(data.error || "Scout failed");
    }

    currentScoutResult = data;
    displayScoutResults(data);
  } catch (err) {
    alert(err.message || "Something went wrong. Please try again.");
    resetToSearch();
  } finally {
    hide(scoutLoading);
  }
});

// Allow Enter key on restaurant name input
restaurantNameInput.addEventListener("keydown", (e) => {
  if (e.key === "Enter") {
    e.preventDefault();
    scoutBtn.click();
  }
});

// ---------------------------------------------------------------------------
// Display Scout Results
// ---------------------------------------------------------------------------

function displayScoutResults(data) {
  const a = data.analysis;

  // Score ring
  const scoreRing = $("#safety-score-ring");
  scoreRing.textContent = a.safety_score;
  scoreRing.className = "score-ring " + getScoreClass(a.safety_score);

  // Safety label
  const label = $("#safety-label");
  label.textContent = a.safety_label;
  label.className = "safety-label-badge " + getScoreClass(a.safety_score);

  // Restaurant info
  $("#scout-restaurant-name").textContent = a.restaurant_name;
  $("#scout-cuisine").textContent = a.cuisine_type;
  $("#scout-summary").textContent = a.summary;

  // Research summary
  $("#research-summary").textContent = a.research_summary || "No research summary available.";

  // Community sentiment
  $("#community-sentiment").textContent = a.community_sentiment || "No celiac-specific community reviews found for this restaurant.";

  // This restaurant: specific findings
  const specPositives = a.this_restaurant ? a.this_restaurant.specific_positives || [] : [];
  populateStringList($("#specific-positives-list"), specPositives);
  $("#specific-positives-count").textContent = specPositives.length;
  toggleSection($("#specific-positives-section"), specPositives.length > 0);

  const specRisks = a.this_restaurant ? a.this_restaurant.specific_risks || [] : [];
  populateStringList($("#specific-risks-list"), specRisks);
  $("#specific-risks-count").textContent = specRisks.length;
  toggleSection($("#specific-risks-section"), specRisks.length > 0);

  // Staff knowledge badge
  const staffLevel = a.this_restaurant ? a.this_restaurant.staff_knowledge || "UNKNOWN" : "UNKNOWN";
  const staffBadge = $("#staff-knowledge-badge");
  staffBadge.textContent = staffLevel;
  staffBadge.className = "staff-badge staff-" + staffLevel.toLowerCase();

  // Menu analysis
  const menu = a.menu_analysis || { likely_safe: [], ask_first: [], red_flags: [] };
  populateMenuList($("#likely-safe-list"), menu.likely_safe);
  $("#safe-count").textContent = menu.likely_safe.length;

  populateMenuList($("#ask-first-list"), menu.ask_first);
  $("#ask-count").textContent = menu.ask_first.length;

  populateMenuList($("#red-flags-list"), menu.red_flags);
  $("#flags-count").textContent = menu.red_flags.length;

  // Cuisine context
  const cuisine = a.cuisine_context || { general_risks: [], general_positives: [] };
  populateStringList($("#cuisine-general-risks"), cuisine.general_risks);
  populateStringList($("#cuisine-general-positives"), cuisine.general_positives);

  // Call script
  $("#call-script-context").textContent = a.call_script_context;
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

  show(scoutResults);
}

function toggleSection(el, visible) {
  if (visible) show(el);
  else hide(el);
}

function getScoreClass(score) {
  if (score >= 8) return "very-low-risk";
  if (score >= 6) return "low-risk";
  if (score >= 4) return "moderate-risk";
  return "high-risk";
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
// Questionnaire
// ---------------------------------------------------------------------------

$("#start-questionnaire-btn").addEventListener("click", () => {
  hide(scoutResults);
  renderQuestionnaire();
  show(questionnaireView);
});

$("#back-to-results-btn").addEventListener("click", () => {
  hide(questionnaireView);
  show(scoutResults);
});

function renderQuestionnaire() {
  const container = $("#questionnaire-questions");
  container.innerHTML = "";

  questionnaireQuestions.forEach((q) => {
    const row = document.createElement("div");
    row.className = "question-row";
    row.innerHTML = `
      <div class="question-text">${escapeHtml(q.text)}</div>
      <div class="question-toggles">
        <button class="toggle-btn" data-question="${q.id}" data-answer="Yes">Yes</button>
        <button class="toggle-btn" data-question="${q.id}" data-answer="No">No</button>
        <button class="toggle-btn" data-question="${q.id}" data-answer="Unsure">Unsure</button>
      </div>
    `;
    container.appendChild(row);
  });

  // Toggle button click handlers
  container.addEventListener("click", (e) => {
    const btn = e.target.closest(".toggle-btn");
    if (!btn) return;

    const questionId = btn.dataset.question;
    const siblings = container.querySelectorAll(`[data-question="${questionId}"]`);
    siblings.forEach((s) => {
      s.className = "toggle-btn";
    });

    const answer = btn.dataset.answer;
    if (answer === "Yes") btn.classList.add("selected-yes");
    else if (answer === "No") btn.classList.add("selected-no");
    else btn.classList.add("selected-unsure");
  });
}

$("#submit-questionnaire-btn").addEventListener("click", async () => {
  // Collect answers
  const answers = {};
  let allAnswered = true;

  questionnaireQuestions.forEach((q) => {
    const selected = document.querySelector(
      `.toggle-btn[data-question="${q.id}"].selected-yes, ` +
      `.toggle-btn[data-question="${q.id}"].selected-no, ` +
      `.toggle-btn[data-question="${q.id}"].selected-unsure`
    );
    if (selected) {
      answers[q.text] = selected.dataset.answer;
    } else {
      allAnswered = false;
    }
  });

  if (!allAnswered) {
    alert("Please answer all questions before submitting.");
    return;
  }

  hide(questionnaireView);
  show(questionnaireLoading);

  try {
    const response = await fetch("/api/restaurant-scout/questionnaire", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        scout_id: currentScoutResult.id,
        original_analysis: currentScoutResult.analysis,
        answers: answers,
      }),
    });

    const data = await response.json();

    if (!response.ok) {
      throw new Error(data.error || "Assessment failed");
    }

    currentScoutResult.final_report = data.final_report;
    displayFinalReport(data.final_report);
  } catch (err) {
    alert(err.message || "Something went wrong. Please try again.");
    hide(questionnaireLoading);
    show(questionnaireView);
    return;
  }

  hide(questionnaireLoading);
});

// ---------------------------------------------------------------------------
// Final Report
// ---------------------------------------------------------------------------

function displayFinalReport(report) {
  // Score ring
  const ring = $("#final-score-ring");
  ring.textContent = report.adjusted_score;
  ring.className = "score-ring " + getScoreClass(report.adjusted_score);

  // Label
  const label = $("#final-label");
  label.textContent = report.adjusted_label;
  label.className = "safety-label-badge " + getScoreClass(report.adjusted_score);

  // Score change
  const changeEl = $("#score-change-indicator");
  const change = report.score_change;
  if (change > 0) {
    changeEl.textContent = `+${change} from initial score`;
    changeEl.className = "positive";
  } else if (change < 0) {
    changeEl.textContent = `${change} from initial score`;
    changeEl.className = "negative";
  } else {
    changeEl.textContent = "No change from initial score";
    changeEl.className = "neutral";
  }

  // Recommendation
  const recBadge = $("#recommendation-badge");
  recBadge.textContent = report.recommendation;
  const recClass = report.recommendation === "GO" ? "go"
    : report.recommendation === "NO-GO" ? "no-go"
    : "caution";
  recBadge.className = recClass;

  $("#recommendation-detail").textContent = report.recommendation_detail;

  // Score reasoning
  $("#score-reasoning").textContent = report.score_reasoning;

  // Safe to order
  populateStringList($("#safe-to-order-list"), report.safe_to_order);
  $("#safe-order-count").textContent = (report.safe_to_order || []).length;

  // Items to avoid
  populateStringList($("#items-to-avoid-list"), report.items_to_avoid);
  $("#avoid-count").textContent = (report.items_to_avoid || []).length;

  // Dining tips
  populateStringList($("#dining-tips-list"), report.dining_tips);
  $("#tips-count").textContent = (report.dining_tips || []).length;

  // Final summary
  $("#final-summary").textContent = report.final_summary;

  // Reset save button
  const saveBtn = $("#save-restaurant-btn");
  saveBtn.textContent = "Save to My Safe Restaurants";
  saveBtn.classList.remove("saved");
  saveBtn.disabled = false;

  show(finalReportView);
}

// ---------------------------------------------------------------------------
// Save Restaurant
// ---------------------------------------------------------------------------

$("#save-restaurant-btn").addEventListener("click", async () => {
  const btn = $("#save-restaurant-btn");
  if (btn.classList.contains("saved")) return;

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

// ---------------------------------------------------------------------------
// Saved Restaurants Panel
// ---------------------------------------------------------------------------

savedToggle.addEventListener("click", async () => {
  show(savedView);
  await loadSaved();
});

savedClose.addEventListener("click", () => {
  hide(savedView);
});

async function loadSaved() {
  try {
    const response = await fetch("/api/restaurant-scout/saved");
    const saved = await response.json();

    savedList.innerHTML = "";

    if (saved.length === 0) {
      hide(savedList);
      show(savedEmpty);
      return;
    }

    show(savedList);
    hide(savedEmpty);

    saved.forEach((restaurant) => {
      const item = document.createElement("div");
      item.className = "saved-item";

      const score = restaurant.final_report
        ? restaurant.final_report.adjusted_score
        : restaurant.analysis.safety_score;
      const scoreClass = getScoreClass(score);

      const date = new Date(restaurant.timestamp);
      const dateStr = date.toLocaleDateString("en-US", {
        month: "short",
        day: "numeric",
        year: "numeric",
      });

      const rec = restaurant.final_report
        ? restaurant.final_report.recommendation
        : null;

      item.innerHTML = `
        <div class="saved-icon score-ring ${scoreClass}" style="width:40px;height:40px;font-size:16px;border-width:3px;">
          ${score}
        </div>
        <div class="saved-info">
          <div class="saved-name">${escapeHtml(restaurant.restaurant_name)}</div>
          <div class="saved-date">${dateStr}${rec ? " &middot; " + rec : ""}</div>
        </div>
        <div class="saved-score safety-label-badge ${scoreClass}">
          ${restaurant.analysis.safety_label}
        </div>
      `;

      savedList.appendChild(item);
    });
  } catch (err) {
    savedList.innerHTML = '<p style="padding:20px;color:var(--text-muted)">Failed to load saved restaurants.</p>';
  }
}

// ---------------------------------------------------------------------------
// Sharing
// ---------------------------------------------------------------------------

function generateShareText(data, isFinalReport) {
  const a = data.analysis;
  let text = `GlutenGuard Report: ${a.restaurant_name} (${a.cuisine_type})`;

  if (isFinalReport && data.final_report) {
    const r = data.final_report;
    text += ` - Safety Score: ${r.adjusted_score}/10 ${r.adjusted_label}.`;
    text += ` ${r.recommendation}: ${r.recommendation_detail}`;
    if (r.safe_to_order?.length) {
      text += ` Safe to order: ${r.safe_to_order.join(", ")}.`;
    }
    if (r.items_to_avoid?.length) {
      text += ` Avoid: ${r.items_to_avoid.join(", ")}.`;
    }
  } else {
    text += ` - Safety Score: ${a.safety_score}/10 ${a.safety_label}.`;
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

$("#share-results-btn").addEventListener("click", () => {
  if (!currentScoutResult) return;
  const text = generateShareText(currentScoutResult, false);
  shareReport(text, $("#share-results-feedback"));
});

$("#share-final-btn").addEventListener("click", () => {
  if (!currentScoutResult) return;
  const text = generateShareText(currentScoutResult, true);
  shareReport(text, $("#share-final-feedback"));
});

// ---------------------------------------------------------------------------
// Smart Alternatives
// ---------------------------------------------------------------------------

$("#find-alternatives-btn").addEventListener("click", () => {
  if (!currentScoutResult) return;
  const a = currentScoutResult.analysis;
  const btn = $("#find-alternatives-btn");
  btn.disabled = true;
  btn.textContent = "Searching...";
  fetchAlternatives(a.cuisine_type, currentLocation, a.restaurant_name);
});

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
          <div class="alt-name">${escapeHtml(alt.name)}</div>
          <div class="alt-cuisine">${escapeHtml(alt.cuisine || "")}${alt.location_note ? " \u00b7 " + escapeHtml(alt.location_note) : ""}</div>
          <div class="alt-reason">${escapeHtml(alt.brief_reason)}</div>
        </div>
        <button class="alt-scout-btn btn btn-secondary">Scout</button>
      `;

      card.querySelector(".alt-scout-btn").addEventListener("click", () => {
        restaurantNameInput.value = alt.name;
        locationInput.value = location;
        menuUrlInput.value = "";
        hide(scoutResults);
        scoutBtn.click();
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
  restaurantNameInput.value = "";
  menuUrlInput.value = "";
  locationInput.value = "";
  currentScoutResult = null;
  currentLocation = "";
  hide(scoutResults);
  hide(questionnaireView);
  hide(questionnaireLoading);
  hide(finalReportView);
  hide(scoutLoading);
  hide($("#alternatives-section"));
  hide($("#find-alternatives-btn"));
  show(searchView);
}

$("#new-scout-btn").addEventListener("click", resetToSearch);
$("#new-scout-final-btn").addEventListener("click", resetToSearch);

// ---------------------------------------------------------------------------
// Utilities
// ---------------------------------------------------------------------------

function escapeHtml(str) {
  const div = document.createElement("div");
  div.textContent = str;
  return div.innerHTML;
}

// ---------------------------------------------------------------------------
// URL Parameter Handling (for links from Discover page)
// ---------------------------------------------------------------------------

(function handleUrlParams() {
  const params = new URLSearchParams(window.location.search);
  const name = params.get("name");
  const location = params.get("location");

  if (name) {
    restaurantNameInput.value = name;
    if (location) {
      locationInput.value = location;
    }
    // Clear URL params without triggering reload
    window.history.replaceState({}, "", window.location.pathname);

    // Auto-trigger search if both name and location provided
    if (name && location) {
      scoutBtn.click();
    }
  }
})();
