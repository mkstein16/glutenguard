import os
import json
import uuid
import base64
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
ALLOWED_EXTENSIONS = {"png", "jpg", "jpeg", "webp", "gif"}

client = Anthropic()

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


@app.route("/")
def index():
    return render_template("index.html")


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

        response_text = message.content[0].text
        # Parse JSON from response (handle potential markdown wrapping)
        if response_text.startswith("```"):
            response_text = response_text.split("\n", 1)[1].rsplit("```", 1)[0]
        analysis = json.loads(response_text)

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


os.makedirs(app.config["UPLOAD_FOLDER"], exist_ok=True)

if __name__ == "__main__":
    port = int(os.environ.get("PORT", 5001))
    debug = os.environ.get("FLASK_ENV") != "production"
    app.run(debug=debug, host="0.0.0.0", port=port)
