const $ = (sel) => document.querySelector(sel);
const show = (el) => el.classList.remove("hidden");
const hide = (el) => el.classList.add("hidden");

// Elements
const fileInput = $("#file-input");
const uploadArea = $("#upload-area");
const previewSection = $("#preview-section");
const previewImage = $("#preview-image");
const cancelBtn = $("#cancel-btn");
const scanBtn = $("#scan-btn");
const loadingSection = $("#loading-section");
const resultsSection = $("#results-section");
const newScanBtn = $("#new-scan-btn");
const historyToggle = $("#history-toggle");
const historyView = $("#history-view");
const historyClose = $("#history-close");
const historyList = $("#history-list");
const historyEmpty = $("#history-empty");

let selectedFile = null;

// File selection
fileInput.addEventListener("change", (e) => {
  const file = e.target.files[0];
  if (!file) return;

  selectedFile = file;
  const reader = new FileReader();
  reader.onload = (ev) => {
    previewImage.src = ev.target.result;
    hide(uploadArea);
    hide(resultsSection);
    show(previewSection);
  };
  reader.readAsDataURL(file);
});

// Cancel
cancelBtn.addEventListener("click", () => {
  resetToUpload();
});

// Scan
scanBtn.addEventListener("click", async () => {
  if (!selectedFile) return;

  hide(previewSection);
  show(loadingSection);

  const formData = new FormData();
  formData.append("image", selectedFile);

  try {
    const response = await fetch("/api/scan", {
      method: "POST",
      body: formData,
    });

    const data = await response.json();

    if (!response.ok) {
      throw new Error(data.error || "Scan failed");
    }

    displayResults(data);
  } catch (err) {
    alert(err.message || "Something went wrong. Please try again.");
    resetToUpload();
  } finally {
    hide(loadingSection);
  }
});

// Display results
function displayResults(data) {
  const analysis = data.analysis;
  const verdict = analysis.verdict.toUpperCase();

  // Verdict badge
  const badge = $("#verdict-badge");
  badge.textContent = verdict;
  badge.className = verdict.toLowerCase();

  // Product name and summary
  $("#product-name").textContent = analysis.product_name;
  $("#verdict-summary").textContent = analysis.summary;
  $("#confidence-badge").textContent = `${analysis.confidence} confidence`;

  // Gluten sources
  const glutenSection = $("#gluten-sources-section");
  const glutenList = $("#gluten-sources-list");
  populateList(glutenList, analysis.gluten_sources);
  $("#gluten-count").textContent = analysis.gluten_sources.length;
  if (analysis.gluten_sources.length === 0) hide(glutenSection);
  else show(glutenSection);

  // Hidden risks
  const risksSection = $("#hidden-risks-section");
  const risksList = $("#hidden-risks-list");
  populateList(risksList, analysis.hidden_risks);
  $("#risks-count").textContent = analysis.hidden_risks.length;
  if (analysis.hidden_risks.length === 0) hide(risksSection);
  else show(risksSection);

  // Cross contamination
  const contaminationSection = $("#cross-contamination-section");
  const contaminationList = $("#cross-contamination-list");
  populateList(contaminationList, analysis.cross_contamination);
  $("#contamination-count").textContent = analysis.cross_contamination.length;
  if (analysis.cross_contamination.length === 0) hide(contaminationSection);
  else show(contaminationSection);

  // Certifications
  const certsSection = $("#certifications-section");
  const certsList = $("#certifications-list");
  populateList(certsList, analysis.certifications);
  $("#certs-count").textContent = analysis.certifications.length;
  if (analysis.certifications.length === 0) hide(certsSection);
  else show(certsSection);

  // All ingredients
  populateList($("#ingredients-list"), analysis.ingredients_found);
  $("#ingredients-count").textContent = analysis.ingredients_found.length;

  // Reasoning
  $("#detailed-reasoning").textContent = analysis.detailed_reasoning;

  show(resultsSection);
}

function populateList(ul, items) {
  ul.innerHTML = "";
  items.forEach((item) => {
    const li = document.createElement("li");
    li.textContent = item;
    ul.appendChild(li);
  });
}

// New scan
newScanBtn.addEventListener("click", () => {
  resetToUpload();
});

function resetToUpload() {
  selectedFile = null;
  fileInput.value = "";
  previewImage.src = "";
  hide(previewSection);
  hide(loadingSection);
  hide(resultsSection);
  show(uploadArea);
}

// History
historyToggle.addEventListener("click", async () => {
  show(historyView);
  await loadHistory();
});

historyClose.addEventListener("click", () => {
  hide(historyView);
});

async function loadHistory() {
  try {
    const response = await fetch("/api/history");
    const history = await response.json();

    historyList.innerHTML = "";

    if (history.length === 0) {
      hide(historyList);
      show(historyEmpty);
      return;
    }

    show(historyList);
    hide(historyEmpty);

    history.forEach((scan) => {
      const item = document.createElement("div");
      item.className = "history-item";

      const date = new Date(scan.timestamp);
      const dateStr = date.toLocaleDateString("en-US", {
        month: "short",
        day: "numeric",
        hour: "numeric",
        minute: "2-digit",
      });

      item.innerHTML = `
        <img class="history-thumb" src="/static/uploads/${scan.filename}" alt="${scan.product_name}" loading="lazy">
        <div class="history-info">
          <div class="history-product">${escapeHtml(scan.product_name)}</div>
          <div class="history-date">${dateStr}</div>
        </div>
        <span class="history-verdict ${scan.verdict.toLowerCase()}">${scan.verdict}</span>
        <button class="history-delete" data-id="${scan.id}" aria-label="Delete scan">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/>
          </svg>
        </button>
      `;

      // Click to view details
      item.addEventListener("click", (e) => {
        if (e.target.closest(".history-delete")) return;
        hide(historyView);
        displayResults(scan);
        hide(uploadArea);
        show(resultsSection);
      });

      // Delete
      item.querySelector(".history-delete").addEventListener("click", async (e) => {
        e.stopPropagation();
        if (!confirm("Delete this scan?")) return;

        try {
          await fetch(`/api/history/${scan.id}`, { method: "DELETE" });
          await loadHistory();
        } catch (err) {
          alert("Failed to delete scan.");
        }
      });

      historyList.appendChild(item);
    });
  } catch (err) {
    historyList.innerHTML = '<p style="padding:20px;color:var(--text-muted)">Failed to load history.</p>';
  }
}

function escapeHtml(str) {
  const div = document.createElement("div");
  div.textContent = str;
  return div.innerHTML;
}
