import os
import json
import uuid
import base64
import traceback
from datetime import datetime

from flask import Flask, request, jsonify, render_template, send_from_directory
from anthropic import Anthropic
from dotenv import load_dotenv

load_dotenv()

app = Flask(__name__)
app.config["UPLOAD_FOLDER"] = os.path.join(
    os.path.dirname(os.path.abspath(__file__)), "static", "uploads"
)
app.config["MAX_CONTENT_LENGTH"] = 10 * 1024 * 1024  # 10MB max

HISTORY_FILE = os.path.join(
    os.path.dirname(os.path.abspath(__file__)), "scan_history.json"
)
RESTAURANT_HISTORY_FILE = os.path.join(
    os.path.dirname(os.path.abspath(__file__)), "restaurant_history.json"
)
ALLOWED_EXTENSIONS = {"png", "jpg", "jpeg", "webp", "gif"}

client = Anthropic()

# ---------------------------------------------------------------------------
# Label Scanner Prompt
# ---------------------------------------------------------------------------

ANALYSIS_PROMPT = """You are a celiac disease food safety expert. Analyze this food product ingredient label image.

Your job is to protect someone with celiac disease from accidental gluten exposure. Be thorough and cautious.

Steps:
1. Read and list ALL ingredients visible on the label.
2. Check for OBVIOUS gluten sources: wheat, barley, rye, oats (unless certified GF), spelt, kamut, triticale, malt, brewer's yeast.
3. Check for HIDDEN gluten sources: modified food starch (if source not specified), hydrolyzed vegetable/plant protein, natural flavors (may derive from barley), caramel color (sometimes from barley), dextrin (if source not specified), maltodextrin (usually safe but flag if source unclear), soy sauce (often contains wheat), seasonings/spice blends (may contain wheat flour).
4. Check for CROSS-CONTAMINATION warnings: "may contain wheat", "processed in a facility that also processes wheat", "made on shared equipment with wheat products".
5. Look for CERTIFICATIONS: certified gluten-free symbols (GFCO, CSA, etc.), allergen statements.

Respond in this exact JSON format:
{
  "product_name": "Best guess at product name from the label, or 'Unknown Product' if not visible",
  "verdict": "SAFE" or "UNSAFE" or "INVESTIGATE",
  "confidence": "HIGH" or "MEDIUM" or "LOW",
  "summary": "One sentence plain-English summary of the verdict",
  "ingredients_found": ["list", "of", "all", "ingredients", "identified"],
  "gluten_sources": ["list of identified gluten-containing ingredients, empty if none"],
  "hidden_risks": ["list of ingredients that MIGHT contain gluten but are ambiguous"],
  "cross_contamination": ["any cross-contamination warnings found"],
  "certifications": ["any gluten-free certifications spotted"],
  "detailed_reasoning": "2-3 sentence explanation of your analysis and why you gave this verdict"
}

Rules for verdicts:
- SAFE: No gluten sources found, no hidden risks, ideally has GF certification
- UNSAFE: Contains obvious gluten sources
- INVESTIGATE: Has hidden risk ingredients or cross-contamination warnings that need verification. When in doubt, use INVESTIGATE — it's better to be cautious.

If the image is not a food label, respond with:
{
  "product_name": "Not a food label",
  "verdict": "INVESTIGATE",
  "confidence": "LOW",
  "summary": "This doesn't appear to be a food ingredient label. Please upload a clear photo of the ingredients list.",
  "ingredients_found": [],
  "gluten_sources": [],
  "hidden_risks": [],
  "cross_contamination": [],
  "certifications": [],
  "detailed_reasoning": "The uploaded image does not appear to contain a food ingredient label."
}

Return ONLY valid JSON, no other text."""

# ---------------------------------------------------------------------------
# Restaurant Scout Prompt
# ---------------------------------------------------------------------------

RESTAURANT_SCOUT_PROMPT = """You are a celiac disease restaurant safety researcher. You MUST perform actual web research before providing your analysis. Do NOT guess or generate generic information.

Restaurant name: {restaurant_name}
{url_context}
{location_context}

## MANDATORY RESEARCH PHASE

You MUST use web_search to perform ALL of the following searches before writing your analysis. Do not skip any search.

1. Search: "{restaurant_name} official website menu"
   → Find the restaurant's actual menu items

2. Search: "{restaurant_name} gluten free reviews"
   → Find real reviews from celiac/GF diners

3. Search: "site:findmeglutenfree.com {restaurant_name}"
   → Check Find Me Gluten Free for celiac-specific reviews and ratings

4. Search: "{restaurant_name} celiac safe"
   → Find any celiac-specific discussions, blog posts, or community advice

{url_search_instruction}

## ANALYSIS RULES

After completing ALL searches above, analyze your findings. Follow these rules strictly:

- ONLY include menu items you found on the restaurant's ACTUAL menu. If you could not find the real menu, say so in research_summary and leave menu_analysis categories empty.
- ONLY cite review sentiments that came from ACTUAL reviews you found. Do not fabricate review quotes or sentiments.
- Separate restaurant-SPECIFIC findings (from reviews, website) from general CUISINE observations. For example: "Reviewers on FMGF mention the chef changes gloves" is specific. "Thai restaurants often use soy sauce" is cuisine context.
- If a search returned no useful results, say so honestly. Do not fill gaps with guesses.

## RESPONSE FORMAT

Respond with ONLY valid JSON in this exact format:
{{
  "restaurant_name": "Exact official name of the restaurant",
  "cuisine_type": "Type of cuisine",
  "safety_score": 5,
  "safety_label": "MODERATE RISK",
  "summary": "2-3 sentence overview based on YOUR ACTUAL RESEARCH FINDINGS",

  "research_summary": "What you found: e.g. 'Found official menu on restaurant website. Found 23 reviews on Find Me Gluten Free (avg 4.1/5). Found 3 relevant Yelp reviews mentioning gluten-free experience. No dedicated GF menu found on website.'",

  "cuisine_context": {{
    "general_risks": ["Cuisine-general risks like 'Soy sauce is common in Thai cooking and usually contains wheat'"],
    "general_positives": ["Cuisine-general positives like 'Rice and rice noodles are staples'"]
  }},

  "this_restaurant": {{
    "specific_risks": ["ONLY from actual reviews/website findings, e.g. 'FMGF reviewer noted shared fryer for spring rolls and fries'"],
    "specific_positives": ["ONLY from actual reviews/website findings, e.g. 'Multiple reviewers praise the chef for understanding cross-contamination'"],
    "staff_knowledge": "HIGH, MEDIUM, LOW, or UNKNOWN — based on what reviews actually say about staff awareness. Use UNKNOWN if no reviews discuss this."
  }},

  "menu_analysis": {{
    "likely_safe": [
      {{"item": "ACTUAL menu item name from their real menu", "note": "Why it's likely safe, referencing real ingredients if found"}}
    ],
    "ask_first": [
      {{"item": "ACTUAL menu item name", "note": "What to ask about and why"}}
    ],
    "red_flags": [
      {{"item": "ACTUAL menu item name", "note": "Why this is risky based on actual menu description or review mentions"}}
    ]
  }},

  "community_sentiment": "Aggregated from ACTUAL reviews found. Include specifics: number of reviews found, average rating if available, common themes. If no reviews found, say 'No celiac-specific community reviews found for this restaurant.'",

  "call_script": [
    {{"question": "Targeted question based on SPECIFIC risks found in your research", "priority": "essential"}},
    {{"question": "Question about a SPECIFIC menu item or practice mentioned in reviews", "priority": "essential"}},
    {{"question": "Do you have a dedicated fryer separate from breaded items?", "priority": "essential"}},
    {{"question": "Can the kitchen use clean gloves, utensils, and prep surfaces for my meal?", "priority": "essential"}},
    {{"question": "Which dishes do you recommend for someone with celiac disease who cannot have ANY gluten?", "priority": "additional"}},
    {{"question": "Additional relevant question", "priority": "additional"}}
  ],
  "call_script_context": "Why these questions matter for THIS specific restaurant based on what you found"
}}

## SCORING RULES
- safety_score: 0-10 (10 = safest). Most restaurants score 3-7. Be cautious.
- safety_label: "VERY LOW RISK" (8-10), "LOW RISK" (6-7), "MODERATE RISK" (4-5), "HIGH RISK" (0-3)
- If you found no real information about this restaurant, cap the score at 4 and note the lack of data.
- call_script: 5-8 questions. Mark 3-5 as "essential" (most critical to ask) and the rest as "additional". Each question must be an object with "question" and "priority" fields. At least 2 essential questions should target specific findings from your research.
- menu_analysis: Only include items from the REAL menu. If menu not found, return empty arrays and explain in research_summary.

Return ONLY valid JSON, no other text."""

# ---------------------------------------------------------------------------
# Post-Call Questionnaire Prompt
# ---------------------------------------------------------------------------

QUESTIONNAIRE_PROMPT = """You are a celiac disease restaurant safety expert. Based on the initial restaurant analysis and the results of a phone call to the restaurant, provide an updated safety assessment.

Original restaurant analysis:
{original_analysis}

Phone call questionnaire results:
{questionnaire_answers}

Based on the phone call results, adjust the safety assessment. Staff knowledge and willingness to accommodate are strong signals — a restaurant that doesn't know what celiac is or seems dismissive is a major red flag regardless of menu options.

Respond in this exact JSON format:
{{
  "adjusted_score": 6,
  "adjusted_label": "LOW RISK",
  "score_change": 1,
  "score_reasoning": "Explanation of why the score went up, down, or stayed the same",
  "recommendation": "GO",
  "recommendation_detail": "2-3 sentence explanation of the recommendation, referencing specific call answers",
  "safe_to_order": ["Specific item 1 that should be safe based on all information", "Specific item 2"],
  "items_to_avoid": ["Specific item 1 to avoid", "Specific item 2 to avoid"],
  "dining_tips": [
    "Specific actionable tip for dining at this restaurant",
    "Another tip based on what was learned from the call"
  ],
  "final_summary": "2-3 sentence final assessment incorporating both the research and call results"
}}

Rules:
- adjusted_score is 0-10. Adjust based on call quality: confident knowledgeable staff = +1 to +3, dismissive or confused staff = -2 to -4
- adjusted_label: "VERY LOW RISK" (8-10), "LOW RISK" (6-7), "MODERATE RISK" (4-5), "HIGH RISK" (0-3)
- recommendation must be one of: "GO", "NO-GO", "PROCEED WITH CAUTION"
  - GO: score >= 7 and staff seemed knowledgeable
  - NO-GO: score <= 3 or staff seemed dismissive/confused about celiac
  - PROCEED WITH CAUTION: everything else
- safe_to_order and items_to_avoid should reference specific menu items from the original analysis
- dining_tips should be practical and specific to this restaurant

Return ONLY valid JSON, no other text."""


# ---------------------------------------------------------------------------
# Alternatives Prompt
# ---------------------------------------------------------------------------

ALTERNATIVES_PROMPT = """You are a celiac disease restaurant safety researcher. A user searched for "{original_restaurant_name}" in {location} and it scored poorly for celiac safety. Find better alternatives nearby.

## MANDATORY RESEARCH

You MUST perform ALL 3 of these web searches:

1. Search: "best celiac safe restaurants {location}"
2. Search: "gluten free restaurants {location} {cuisine_type}"
3. Search: "site:findmeglutenfree.com {location}"

## RESPONSE FORMAT

Based on your research, return ONLY valid JSON:
{{
  "alternatives": [
    {{
      "name": "Real restaurant name found in search results",
      "cuisine": "Type of cuisine",
      "estimated_safety_score": 8,
      "safety_label": "VERY LOW RISK",
      "brief_reason": "Why this is a good celiac-safe option based on what you found",
      "location_note": "Neighborhood or address detail if found"
    }}
  ]
}}

## RULES
- Only include restaurants you actually found in your search results. Do NOT make up restaurants.
- Prefer restaurants listed on Find Me Gluten Free with good ratings.
- Exclude "{original_restaurant_name}" from results.
- Return 1-3 alternatives. If you found none, return an empty alternatives array.
- estimated_safety_score: use same 0-10 scale. Base it on what reviews/listings say.
- safety_label: "VERY LOW RISK" (8-10), "LOW RISK" (6-7), "MODERATE RISK" (4-5), "HIGH RISK" (0-3)

Return ONLY valid JSON, no other text."""

# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def allowed_file(filename):
    return "." in filename and filename.rsplit(".", 1)[1].lower() in ALLOWED_EXTENSIONS


def load_history():
    if os.path.exists(HISTORY_FILE):
        with open(HISTORY_FILE, "r") as f:
            return json.load(f)
    return []


def save_history(history):
    with open(HISTORY_FILE, "w") as f:
        json.dump(history, f, indent=2)


def load_restaurant_history():
    if os.path.exists(RESTAURANT_HISTORY_FILE):
        with open(RESTAURANT_HISTORY_FILE, "r") as f:
            return json.load(f)
    return []


def save_restaurant_history(history):
    with open(RESTAURANT_HISTORY_FILE, "w") as f:
        json.dump(history, f, indent=2)


def get_media_type(filename):
    ext = filename.rsplit(".", 1)[1].lower()
    types = {
        "png": "image/png",
        "jpg": "image/jpeg",
        "jpeg": "image/jpeg",
        "webp": "image/webp",
        "gif": "image/gif",
    }
    return types.get(ext, "image/jpeg")


def parse_claude_json(response_text):
    text = response_text.strip()
    # Remove markdown code fences if present
    if "```" in text:
        # Find content between code fences
        parts = text.split("```")
        for part in parts:
            # Skip the language identifier line (e.g., "json\n")
            if part.strip().startswith("json"):
                part = part.strip()[4:].strip()
            elif part.strip().startswith("{"):
                pass
            else:
                continue
            if "{" in part:
                text = part
                break
    # Extract just the JSON object: from first { to last }
    start = text.find("{")
    end = text.rfind("}")
    if start != -1 and end != -1 and end > start:
        text = text[start:end + 1]
    return json.loads(text)


# ---------------------------------------------------------------------------
# Page Routes
# ---------------------------------------------------------------------------

@app.route("/")
def hub():
    return render_template("hub.html")


@app.route("/scan")
def scan_page():
    return render_template("index.html")


@app.route("/restaurant-scout")
def restaurant_scout_page():
    return render_template("restaurant_scout.html")


@app.route("/discover")
def discover_page():
    return render_template("discover.html")


# ---------------------------------------------------------------------------
# Label Scanner API
# ---------------------------------------------------------------------------

@app.route("/api/scan", methods=["POST"])
def scan_label():
    if "image" not in request.files:
        return jsonify({"error": "No image uploaded"}), 400

    file = request.files["image"]
    if file.filename == "":
        return jsonify({"error": "No file selected"}), 400

    if not allowed_file(file.filename):
        return jsonify({"error": "File type not allowed. Use PNG, JPG, WEBP, or GIF."}), 400

    # Save file
    scan_id = str(uuid.uuid4())[:8]
    ext = file.filename.rsplit(".", 1)[1].lower()
    filename = f"{scan_id}.{ext}"
    filepath = os.path.join(app.config["UPLOAD_FOLDER"], filename)
    file.save(filepath)

    # Read and encode image
    with open(filepath, "rb") as f:
        image_data = base64.standard_b64encode(f.read()).decode("utf-8")

    media_type = get_media_type(filename)

    # Call Claude Vision API
    try:
        message = client.messages.create(
            model="claude-sonnet-4-20250514",
            max_tokens=1500,
            messages=[
                {
                    "role": "user",
                    "content": [
                        {
                            "type": "image",
                            "source": {
                                "type": "base64",
                                "media_type": media_type,
                                "data": image_data,
                            },
                        },
                        {
                            "type": "text",
                            "text": ANALYSIS_PROMPT,
                        },
                    ],
                }
            ],
        )

        analysis = parse_claude_json(message.content[0].text)

    except json.JSONDecodeError:
        return jsonify({"error": "Failed to parse analysis. Please try again."}), 500
    except Exception as e:
        return jsonify({"error": f"Analysis failed: {str(e)}"}), 500

    # Save to history
    scan_record = {
        "id": scan_id,
        "filename": filename,
        "product_name": analysis.get("product_name", "Unknown Product"),
        "verdict": analysis["verdict"],
        "confidence": analysis.get("confidence", "MEDIUM"),
        "summary": analysis["summary"],
        "timestamp": datetime.now().isoformat(),
        "analysis": analysis,
    }

    history = load_history()
    history.insert(0, scan_record)
    save_history(history)

    return jsonify(scan_record)


@app.route("/api/history", methods=["GET"])
def get_history():
    history = load_history()
    return jsonify(history)


@app.route("/api/history/<scan_id>", methods=["DELETE"])
def delete_scan(scan_id):
    history = load_history()
    updated = [s for s in history if s["id"] != scan_id]

    if len(updated) == len(history):
        return jsonify({"error": "Scan not found"}), 404

    # Delete image file
    removed = next(s for s in history if s["id"] == scan_id)
    filepath = os.path.join(app.config["UPLOAD_FOLDER"], removed["filename"])
    if os.path.exists(filepath):
        os.remove(filepath)

    save_history(updated)
    return jsonify({"success": True})


# ---------------------------------------------------------------------------
# Restaurant Scout API
# ---------------------------------------------------------------------------

@app.route("/api/restaurant-scout", methods=["POST"])
def restaurant_scout_analyze():
    data = request.get_json()
    if not data or not data.get("restaurant_name", "").strip():
        return jsonify({"error": "Restaurant name is required"}), 400

    restaurant_name = data["restaurant_name"].strip()
    menu_url = data.get("menu_url", "").strip()
    location = data.get("location", "").strip()

    # Check cache first (only if no custom menu_url provided)
    if not menu_url:
        cached = get_cached_restaurant(restaurant_name, location)
        if cached:
            print(f"[SCOUT] Returning cached result for: {restaurant_name}")
            return jsonify(cached)

    url_context = ""
    url_search_instruction = ""
    if menu_url:
        url_context = f"Menu or website URL provided by user: {menu_url}"
        url_search_instruction = (
            f'5. Search: "{menu_url}"\n'
            f"   → Fetch the user-provided URL for menu or restaurant details"
        )

    location_context = f"Location: {location}" if location else ""

    prompt = RESTAURANT_SCOUT_PROMPT.format(
        restaurant_name=restaurant_name,
        url_context=url_context,
        url_search_instruction=url_search_instruction,
        location_context=location_context,
    )

    try:
        print(f"[SCOUT] Starting analysis for: {restaurant_name}")
        message = client.messages.create(
            model="claude-sonnet-4-20250514",
            max_tokens=10000,
            tools=[{"type": "web_search_20250305", "name": "web_search", "max_uses": 5}],
            messages=[{"role": "user", "content": prompt}],
        )

        # Log response structure for debugging
        block_types = [block.type for block in message.content]
        print(f"[SCOUT] Response blocks: {block_types}")
        print(f"[SCOUT] Stop reason: {message.stop_reason}")

        # With web_search, response has multiple content blocks.
        # Find the last text block which contains the JSON analysis.
        response_text = None
        for block in reversed(message.content):
            if block.type == "text":
                response_text = block.text
                break

        if not response_text:
            print(f"[SCOUT] ERROR: No text block found in response")
            return jsonify({
                "error": "No analysis text in response. Please try again.",
                "debug": {"block_types": block_types, "stop_reason": message.stop_reason},
            }), 500

        print(f"[SCOUT] Raw response (first 500 chars): {response_text[:500]}")
        analysis = parse_claude_json(response_text)
        print(f"[SCOUT] Successfully parsed analysis for: {analysis.get('restaurant_name', 'unknown')}")

    except json.JSONDecodeError as e:
        print(f"[SCOUT] JSON parse error: {e}")
        print(f"[SCOUT] Raw text that failed to parse:\n{response_text}")
        return jsonify({
            "error": "Failed to parse analysis. Please try again.",
            "debug": {"parse_error": str(e), "raw_response": response_text[:2000]},
        }), 500
    except Exception as e:
        print(f"[SCOUT] Exception: {e}")
        print(f"[SCOUT] Traceback:\n{traceback.format_exc()}")
        return jsonify({
            "error": f"Analysis failed: {str(e)}",
            "debug": {"exception_type": type(e).__name__, "traceback": traceback.format_exc()},
        }), 500

    scout_id = str(uuid.uuid4())[:8]
    result = {
        "id": scout_id,
        "restaurant_name": restaurant_name,
        "menu_url": menu_url,
        "timestamp": datetime.now().isoformat(),
        "analysis": analysis,
    }

    # Cache the result (only if no custom menu_url)
    if not menu_url:
        cache_restaurant_result(restaurant_name, location, result)

    return jsonify(result)


@app.route("/api/restaurant-scout/questionnaire", methods=["POST"])
def restaurant_scout_questionnaire():
    data = request.get_json()
    if not data or not data.get("original_analysis") or not data.get("answers"):
        return jsonify({"error": "Original analysis and answers are required"}), 400

    answers_text = "\n".join(
        f"- {q}: {a}" for q, a in data["answers"].items()
    )

    prompt = QUESTIONNAIRE_PROMPT.format(
        original_analysis=json.dumps(data["original_analysis"], indent=2),
        questionnaire_answers=answers_text,
    )

    try:
        message = client.messages.create(
            model="claude-sonnet-4-20250514",
            max_tokens=2000,
            messages=[{"role": "user", "content": prompt}],
        )
        final_report = parse_claude_json(message.content[0].text)
    except json.JSONDecodeError:
        return jsonify({"error": "Failed to parse assessment. Please try again."}), 500
    except Exception as e:
        return jsonify({"error": f"Assessment failed: {str(e)}"}), 500

    return jsonify({
        "scout_id": data.get("scout_id"),
        "final_report": final_report,
    })


@app.route("/api/restaurant-scout/save", methods=["POST"])
def restaurant_scout_save():
    data = request.get_json()
    if not data:
        return jsonify({"error": "No data provided"}), 400

    record = {
        "id": data.get("id", str(uuid.uuid4())[:8]),
        "restaurant_name": data.get("restaurant_name"),
        "timestamp": datetime.now().isoformat(),
        "analysis": data.get("analysis"),
        "final_report": data.get("final_report"),
    }

    history = load_restaurant_history()
    history = [r for r in history if r["id"] != record["id"]]
    history.insert(0, record)
    save_restaurant_history(history)

    return jsonify({"success": True, "id": record["id"]})


@app.route("/api/restaurant-scout/alternatives", methods=["POST"])
def restaurant_scout_alternatives():
    data = request.get_json()
    if not data or not data.get("location", "").strip():
        return jsonify({"error": "Location is required for alternatives"}), 400

    location = data["location"].strip()
    cuisine_type = data.get("cuisine_type", "").strip()
    original_name = data.get("original_restaurant_name", "").strip()

    prompt = ALTERNATIVES_PROMPT.format(
        original_restaurant_name=original_name,
        location=location,
        cuisine_type=cuisine_type,
    )

    try:
        print(f"[SCOUT-ALT] Finding alternatives near {location} for {original_name}")
        message = client.messages.create(
            model="claude-sonnet-4-20250514",
            max_tokens=2000,
            tools=[{"type": "web_search_20250305", "name": "web_search", "max_uses": 3}],
            messages=[{"role": "user", "content": prompt}],
        )

        response_text = None
        for block in reversed(message.content):
            if block.type == "text":
                response_text = block.text
                break

        if not response_text:
            print(f"[SCOUT-ALT] ERROR: No text block found in response")
            return jsonify({"alternatives": []}), 200

        print(f"[SCOUT-ALT] Raw response (first 500 chars): {response_text[:500]}")
        result = parse_claude_json(response_text)
        print(f"[SCOUT-ALT] Found {len(result.get('alternatives', []))} alternatives")
        return jsonify(result)

    except json.JSONDecodeError as e:
        print(f"[SCOUT-ALT] JSON parse error: {e}")
        return jsonify({"alternatives": []}), 200
    except Exception as e:
        print(f"[SCOUT-ALT] Exception: {e}")
        print(f"[SCOUT-ALT] Traceback:\n{traceback.format_exc()}")
        return jsonify({"alternatives": []}), 200


@app.route("/api/restaurant-scout/saved", methods=["GET"])
def restaurant_scout_saved():
    history = load_restaurant_history()
    return jsonify(history)


# ---------------------------------------------------------------------------
# Discovery API
# ---------------------------------------------------------------------------

DISCOVER_PROMPT = """You are a celiac disease restaurant researcher. Find gluten-free-friendly {cuisine} restaurants in {location}.

## MANDATORY RESEARCH

You MUST perform these web searches:

1. Search: "{cuisine} celiac safe {location}"
2. Search: "{cuisine} gluten free {location}"
3. Search: "site:findmeglutenfree.com {cuisine} {location}"

## RESPONSE FORMAT

Based on your research, return ONLY valid JSON with up to 5 restaurants you actually found:
{{
  "restaurants": [
    {{
      "name": "Exact restaurant name from search results",
      "address": "Address if found, or neighborhood/area",
      "cuisine_type": "{cuisine}",
      "brief_safety_note": "1-2 sentences about why this appeared in GF searches (e.g., 'Listed on Find Me Gluten Free with 4.5 stars. Multiple reviewers mention dedicated GF menu.')",
      "source": "Where you found it (e.g., 'Find Me Gluten Free', 'Yelp GF reviews', 'Google')"
    }}
  ]
}}

## RULES
- Only include restaurants you actually found in your search results. Do NOT make up restaurants.
- Prefer restaurants with good celiac/GF reviews or listings on Find Me Gluten Free.
- Return 1-5 restaurants. If you found none, return an empty array.
- brief_safety_note should explain WHY this restaurant appears to be GF-friendly based on what you found.

Return ONLY valid JSON, no other text."""


@app.route("/api/discover", methods=["POST"])
def discover_restaurants():
    data = request.get_json()
    if not data:
        return jsonify({"error": "Request body required"}), 400

    cuisine = data.get("cuisine", "").strip()
    location = data.get("location", "").strip()

    if not cuisine or not location:
        return jsonify({"error": "Cuisine and location are required"}), 400

    prompt = DISCOVER_PROMPT.format(cuisine=cuisine, location=location)

    try:
        print(f"[DISCOVER] Searching for {cuisine} restaurants in {location}")
        message = client.messages.create(
            model="claude-sonnet-4-20250514",
            max_tokens=2000,
            tools=[{"type": "web_search_20250305", "name": "web_search", "max_uses": 3}],
            messages=[{"role": "user", "content": prompt}],
        )

        response_text = None
        for block in reversed(message.content):
            if block.type == "text":
                response_text = block.text
                break

        if not response_text:
            print(f"[DISCOVER] ERROR: No text block found in response")
            return jsonify({"restaurants": []}), 200

        print(f"[DISCOVER] Raw response (first 500 chars): {response_text[:500]}")
        result = parse_claude_json(response_text)
        restaurants = result.get("restaurants", [])
        print(f"[DISCOVER] Found {len(restaurants)} restaurants")

        # Check cache for any existing scores
        if restaurants:
            names = [r["name"] for r in restaurants]
            cached_scores = get_cached_scores(names, location)

            # Attach cached scores where available
            for r in restaurants:
                norm_name = " ".join(r["name"].lower().split())
                if norm_name in cached_scores:
                    r["cached_score"] = cached_scores[norm_name]

        return jsonify({"restaurants": restaurants})

    except json.JSONDecodeError as e:
        print(f"[DISCOVER] JSON parse error: {e}")
        return jsonify({"restaurants": []}), 200
    except Exception as e:
        print(f"[DISCOVER] Exception: {e}")
        print(f"[DISCOVER] Traceback:\n{traceback.format_exc()}")
        return jsonify({"restaurants": []}), 200


# ---------------------------------------------------------------------------
# Startup
# ---------------------------------------------------------------------------

os.makedirs(app.config["UPLOAD_FOLDER"], exist_ok=True)

from database import init_tables, get_cached_restaurant, cache_restaurant_result, get_cached_scores
init_tables()

if __name__ == "__main__":
    port = int(os.environ.get("PORT", 5001))
    debug = os.environ.get("FLASK_ENV") != "production"
    app.run(debug=debug, host="0.0.0.0", port=port)
