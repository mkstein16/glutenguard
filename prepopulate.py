"""Prepopulate the restaurant cache with a hardcoded list.

Run manually:  python prepopulate.py
"""

import time

from dotenv import load_dotenv

load_dotenv()

from app import parse_claude_json, RESTAURANT_SCOUT_PROMPT
from database import get_cached_restaurant, cache_restaurant_result
from fulfill_requests import fulfill_one

# Add restaurants here — each entry needs 'name' and 'location'.
RESTAURANTS = [
    # === PHILLY: Dedicated GF / Celiac-Famous (these should score 9-10) ===
    {"name": "Fox & Son", "location": "Reading Terminal Market, Philadelphia"},
    {"name": "P.S. & Co.", "location": "Philadelphia"},
    {"name": "Okie Dokie Donuts", "location": "Philadelphia"},
    {"name": "Flakely Gluten Free", "location": "Philadelphia"},
    {"name": "Sparrow's Gourmet Snacks", "location": "Reading Terminal Market, Philadelphia"},
    {"name": "Moonbowls", "location": "Philadelphia"},
    {"name": "Taffets Bakery", "location": "Philadelphia"},

    # === PHILLY: High-End / Date Night ===
    {"name": "Vernick Food & Drink", "location": "Philadelphia"},
    {"name": "Vedge", "location": "Philadelphia"},
    {"name": "Kalaya", "location": "Philadelphia"},
    {"name": "Barclay Prime", "location": "Philadelphia"},
    {"name": "Zahav", "location": "Philadelphia"},
    {"name": "Laurel", "location": "Philadelphia"},
    {"name": "Ocean Prime", "location": "Philadelphia"},
    {"name": "El Vez", "location": "Philadelphia"},
    {"name": "The Dandelion", "location": "Philadelphia"},
    {"name": "Loch Bar", "location": "Philadelphia"},
    {"name": "Buddakan", "location": "Philadelphia"},

    # === PHILLY: Popular / Casual ===
    {"name": "Middle Child", "location": "Philadelphia"},
    {"name": "Gabriella's Vietnam", "location": "Philadelphia"},
    {"name": "Kampar", "location": "Philadelphia"},
    {"name": "Mission Taqueria", "location": "Philadelphia"},
    {"name": "Doro Bet", "location": "Philadelphia"},
    {"name": "Puyero Venezuelan Flavor", "location": "Philadelphia"},
    {"name": "Cry Baby Pasta", "location": "Philadelphia"},
    {"name": "Wilder", "location": "Philadelphia"},
    {"name": "The Love", "location": "Philadelphia"},
    {"name": "White Yak Restaurant", "location": "Philadelphia"},
    {"name": "Sabrina's Cafe", "location": "Philadelphia"},
    {"name": "Marathon Grill", "location": "Philadelphia"},
    {"name": "Real Food Eatery", "location": "Philadelphia"},
    {"name": "Front Street Cafe", "location": "Philadelphia"},

    # === PHILLY: Challenging Cuisines for Celiacs ===
    {"name": "Giorgio on Pine", "location": "Philadelphia"},
    {"name": "Giuseppe & Sons", "location": "Philadelphia"},
    {"name": "EMei Restaurant", "location": "Philadelphia Chinatown"},
    {"name": "Kinme Sushi", "location": "Philadelphia"},
    {"name": "Kaiseki", "location": "Philadelphia"},
    {"name": "Grandma's Philly", "location": "Philadelphia"},

    # === PHILLY: Brunch / Breakfast ===
    {"name": "Cafe La Maude", "location": "Philadelphia"},
    {"name": "The Wayward", "location": "Philadelphia"},
    {"name": "Snockey's Oyster House", "location": "Philadelphia"},

    # === PHILLY: Philly Staples ===
    {"name": "Campo's Deli", "location": "Philadelphia"},
    {"name": "The Olde Bar", "location": "Philadelphia"},
    {"name": "Estia", "location": "Philadelphia"},

    # === NATIONAL CHAINS: Most Discussed on r/Celiac ===
    {"name": "P.F. Chang's", "location": ""},
    {"name": "Outback Steakhouse", "location": ""},
    {"name": "True Food Kitchen", "location": ""},
    {"name": "Chipotle", "location": ""},
    {"name": "Five Guys", "location": ""},
    {"name": "In-N-Out Burger", "location": ""},
    {"name": "Chick-fil-A", "location": ""},
    {"name": "The Cheesecake Factory", "location": ""},
    {"name": "Red Robin", "location": ""},
    {"name": "Olive Garden", "location": ""},
    {"name": "Bonefish Grill", "location": ""},
    {"name": "Carrabba's Italian Grill", "location": ""},
    {"name": "Fogo de Chao", "location": ""},
    {"name": "Shake Shack", "location": ""},
    {"name": "BJ's Restaurant", "location": ""},
    {"name": "Maggiano's Little Italy", "location": ""},
    {"name": "Chili's", "location": ""},
    {"name": "The Melting Pot", "location": ""},
    {"name": "110 Grill", "location": ""},
    {"name": "Snooze an AM Eatery", "location": ""},
]


def main():
    if not RESTAURANTS:
        print("RESTAURANTS list is empty. Add entries to prepopulate.py and re-run.")
        return

    total = len(RESTAURANTS)
    print(f"Prepopulating {total} restaurant(s).\n")

    skipped = 0
    analyzed = 0

    for i, entry in enumerate(RESTAURANTS, 1):
        name = entry["name"]
        location = entry.get("location", "")
        print(f"[{i}/{total}] {name}, {location or 'no location'}...", end=" ")

        cached = get_cached_restaurant(name, location)
        if cached:
            print("CACHED — skipping")
            skipped += 1
            continue

        try:
            # Reuse fulfill_one with a fake request dict
            req = {"restaurant_name": name, "location": location}
            result = fulfill_one(req)
            score = result["analysis"].get("safety_score", "?")
            print(f"DONE — safety score: {score}/10")
            analyzed += 1
        except Exception as e:
            print(f"FAILED — {e}")

        # Delay between API calls (skip after the last entry)
        if i < total:
            print("  Waiting 120s...")
            time.sleep(120)

    print(f"\nFinished. Analyzed: {analyzed}, Skipped (cached): {skipped}, Total: {total}")


if __name__ == "__main__":
    main()
