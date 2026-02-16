"""Process unfulfilled restaurant requests.

Run manually:  python fulfill_requests.py
"""

import json
import time
import uuid
from datetime import datetime

from dotenv import load_dotenv

load_dotenv()

from anthropic import Anthropic
from app import RESTAURANT_SCOUT_PROMPT, parse_claude_json
from database import (
    get_pending_requests,
    mark_request_fulfilled,
    cache_restaurant_result,
)

client = Anthropic()


def fulfill_one(req):
    """Run the restaurant scout analysis for a single request."""
    name = req["restaurant_name"]
    location = req["location"] or ""

    location_context = f"Location: {location}" if location else ""

    prompt = RESTAURANT_SCOUT_PROMPT.format(
        restaurant_name=name,
        url_context="",
        url_search_instruction="",
        location_context=location_context,
    )

    message = client.messages.create(
        model="claude-sonnet-4-20250514",
        max_tokens=10000,
        tools=[{"type": "web_search_20250305", "name": "web_search", "max_uses": 5}],
        messages=[{"role": "user", "content": prompt}],
    )

    # Extract the last text block (same logic as the /api/restaurant-scout endpoint)
    response_text = None
    for block in reversed(message.content):
        if block.type == "text":
            response_text = block.text
            break

    if not response_text:
        raise RuntimeError("No text block in Claude response")

    analysis = parse_claude_json(response_text)

    # Build the result dict in the same shape the endpoint produces
    result = {
        "id": str(uuid.uuid4())[:8],
        "restaurant_name": name,
        "menu_url": "",
        "timestamp": datetime.now().isoformat(),
        "analysis": analysis,
    }

    # Cache it (identical to what the endpoint does)
    cache_restaurant_result(name, location, result)

    return result


def main():
    requests = get_pending_requests()

    if not requests:
        print("No pending requests. Queue is empty.")
        return

    total = len(requests)
    print(f"Found {total} pending request(s).\n")

    for i, req in enumerate(requests, 1):
        name = req["restaurant_name"]
        location = req["location"] or "no location"
        print(f"Analyzing {i}/{total}: {name}, {location}...")

        try:
            result = fulfill_one(req)
            mark_request_fulfilled(req["id"])
            score = result["analysis"].get("safety_score", "?")
            print(f"  Done — safety score: {score}/10")
        except Exception as e:
            print(f"  FAILED — {e}")

        # Delay between calls (skip after the last one)
        if i < total:
            print(f"  Waiting 60s before next request...")
            time.sleep(60)

    print(f"\nFinished processing {total} request(s).")


if __name__ == "__main__":
    main()
