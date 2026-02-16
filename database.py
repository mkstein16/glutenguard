import os
import json
import psycopg2
import psycopg2.errors
from psycopg2.extras import RealDictCursor
from datetime import datetime, timedelta, timezone


def get_connection():
    """Get a database connection using DATABASE_URL from environment."""
    database_url = os.environ.get("DATABASE_URL")
    if not database_url:
        return None
    return psycopg2.connect(database_url, cursor_factory=RealDictCursor)


def init_tables():
    """Create tables using schema.sql if they don't already exist. Returns True
    if successful, False if DATABASE_URL is not configured or tables already
    exist."""
    conn = get_connection()
    if conn is None:
        print("[DB] DATABASE_URL not set, skipping database initialization")
        return False

    schema_path = os.path.join(os.path.dirname(os.path.abspath(__file__)), "schema.sql")
    try:
        with open(schema_path) as f:
            schema_sql = f.read()
    except FileNotFoundError:
        print("[DB] schema.sql not found, skipping database initialization")
        return False

    try:
        with conn:
            with conn.cursor() as cur:
                cur.execute(schema_sql)
        print("[DB] Tables initialized successfully")
        return True
    except psycopg2.errors.DuplicateTable:
        print("[DB] Tables already exist, skipping")
        return True
    except Exception as e:
        print(f"[DB] Failed to initialize tables: {e}")
        return False
    finally:
        conn.close()


def normalize_name(name):
    """Normalize restaurant name for cache key: lowercase, normalize '&'/'and',
    strip punctuation, and collapse whitespace."""
    name = name.lower()
    name = name.replace('&', ' and ')
    for ch in ".,'-":
        name = name.replace(ch, '')
    return " ".join(name.split())


def normalize_location(location):
    """Normalize location for cache key: lowercase and strip whitespace."""
    if not location:
        return ""
    return " ".join(location.lower().split())


def get_cached_restaurant(name, location):
    """Look up a cached restaurant result. Returns a dict with 'restaurant_id' (database ID)
    and 'data' (the analysis JSON) if found and not expired (< 30 days old), otherwise None."""
    conn = get_connection()
    if conn is None:
        print("[CACHE] No database connection")
        return None

    norm_name = normalize_name(name)
    norm_location = normalize_location(location)
    print(f"[CACHE] Looking up: norm_name='{norm_name}', norm_location='{norm_location}'")
    cache_ttl = timedelta(days=30)

    try:
        with conn.cursor() as cur:
            cur.execute(
                """
                SELECT id, name, location, search_query, safety_score, analysis_json,
                       searched_at, expires_at
                FROM restaurants
                WHERE LOWER(name) = %s AND LOWER(location) = %s
                """,
                (norm_name, norm_location),
            )
            row = cur.fetchone()

        if not row:
            return None

        # Check if expired (searched_at older than 30 days)
        searched_at = row["searched_at"]
        if searched_at.tzinfo is None:
            searched_at = searched_at.replace(tzinfo=timezone.utc)
        now = datetime.now(timezone.utc)

        if now - searched_at > cache_ttl:
            print(f"[CACHE] Expired cache for {name} ({location})")
            return None

        print(f"[CACHE] Hit for {name} ({location})")
        return {"restaurant_id": row["id"], "data": row["analysis_json"]}

    except Exception as e:
        print(f"[CACHE] Error reading cache: {e}")
        return None
    finally:
        conn.close()


def cache_restaurant_result(name, location, result_json):
    """Save or update a restaurant result in the cache."""
    conn = get_connection()
    if conn is None:
        return False

    norm_name = normalize_name(name)
    norm_location = normalize_location(location)
    search_query = f"{name} {location}".strip()
    safety_score = result_json.get("analysis", {}).get("safety_score")
    now = datetime.now(timezone.utc)
    expires_at = now + timedelta(days=30)

    try:
        with conn:
            with conn.cursor() as cur:
                cur.execute(
                    """
                    INSERT INTO restaurants (name, location, search_query, safety_score,
                                             analysis_json, searched_at, expires_at)
                    VALUES (%s, %s, %s, %s, %s, %s, %s)
                    ON CONFLICT (name, location) DO UPDATE SET
                        search_query = EXCLUDED.search_query,
                        safety_score = EXCLUDED.safety_score,
                        analysis_json = EXCLUDED.analysis_json,
                        searched_at = EXCLUDED.searched_at,
                        expires_at = EXCLUDED.expires_at
                    """,
                    (norm_name, norm_location, search_query, safety_score,
                     json.dumps(result_json), now, expires_at),
                )
        print(f"[CACHE] Saved {name} ({location})")
        return True
    except Exception as e:
        print(f"[CACHE] Error saving to cache: {e}")
        return False
    finally:
        conn.close()


def get_cached_scores(names, location):
    """Look up cached safety scores for multiple restaurant names.
    Returns a dict mapping normalized names to safety scores."""
    conn = get_connection()
    if conn is None:
        return {}

    norm_location = normalize_location(location)
    norm_names = [normalize_name(n) for n in names]

    try:
        with conn.cursor() as cur:
            cur.execute(
                """
                SELECT LOWER(name) as norm_name, safety_score
                FROM restaurants
                WHERE LOWER(location) = %s AND LOWER(name) = ANY(%s)
                """,
                (norm_location, norm_names),
            )
            rows = cur.fetchall()

        return {row["norm_name"]: row["safety_score"] for row in rows}

    except Exception as e:
        print(f"[CACHE] Error reading bulk cache: {e}")
        return {}
    finally:
        conn.close()


def get_or_create_user(email):
    """Get existing user by email or create a new one. Returns user dict with id and email."""
    conn = get_connection()
    if conn is None:
        return None

    email = email.lower().strip()

    try:
        with conn:
            with conn.cursor() as cur:
                # Try to find existing user
                cur.execute("SELECT id, email FROM users WHERE email = %s", (email,))
                row = cur.fetchone()

                if row:
                    return dict(row)

                # Create new user
                cur.execute(
                    "INSERT INTO users (email) VALUES (%s) RETURNING id, email",
                    (email,),
                )
                row = cur.fetchone()
                return dict(row)

    except Exception as e:
        print(f"[USER] Error getting/creating user: {e}")
        return None
    finally:
        conn.close()


def get_user_by_id(user_id):
    """Get user by ID. Returns user dict or None."""
    conn = get_connection()
    if conn is None:
        return None

    try:
        with conn.cursor() as cur:
            cur.execute("SELECT id, email FROM users WHERE id = %s", (user_id,))
            row = cur.fetchone()
            return dict(row) if row else None

    except Exception as e:
        print(f"[USER] Error getting user: {e}")
        return None
    finally:
        conn.close()


def get_restaurant_id(name, location):
    """Get restaurant ID by name and location. Returns ID or None."""
    conn = get_connection()
    if conn is None:
        return None

    norm_name = normalize_name(name)
    norm_location = normalize_location(location)

    try:
        with conn.cursor() as cur:
            cur.execute(
                "SELECT id FROM restaurants WHERE LOWER(name) = %s AND LOWER(location) = %s",
                (norm_name, norm_location),
            )
            row = cur.fetchone()
            return row["id"] if row else None

    except Exception as e:
        print(f"[DB] Error getting restaurant ID: {e}")
        return None
    finally:
        conn.close()


def restaurant_exists(restaurant_id):
    """Check if a restaurant exists by ID. Returns True if exists."""
    conn = get_connection()
    if conn is None:
        return False

    try:
        with conn.cursor() as cur:
            cur.execute("SELECT 1 FROM restaurants WHERE id = %s", (restaurant_id,))
            return cur.fetchone() is not None

    except Exception as e:
        print(f"[DB] Error checking restaurant exists: {e}")
        return False
    finally:
        conn.close()


def save_user_restaurant(user_id, restaurant_id):
    """Save a restaurant to user's saved list. Returns True if successful."""
    conn = get_connection()
    if conn is None:
        return False

    try:
        with conn:
            with conn.cursor() as cur:
                cur.execute(
                    """
                    INSERT INTO saved_restaurants (user_id, restaurant_id)
                    VALUES (%s, %s)
                    ON CONFLICT (user_id, restaurant_id) DO NOTHING
                    """,
                    (user_id, restaurant_id),
                )
        return True

    except Exception as e:
        print(f"[DB] Error saving restaurant: {e}")
        return False
    finally:
        conn.close()


def is_restaurant_saved(user_id, restaurant_id):
    """Check if a restaurant is already saved by user."""
    conn = get_connection()
    if conn is None:
        return False

    try:
        with conn.cursor() as cur:
            cur.execute(
                "SELECT 1 FROM saved_restaurants WHERE user_id = %s AND restaurant_id = %s",
                (user_id, restaurant_id),
            )
            return cur.fetchone() is not None

    except Exception as e:
        print(f"[DB] Error checking saved restaurant: {e}")
        return False
    finally:
        conn.close()


def unsave_user_restaurant(user_id, restaurant_id):
    """Remove a restaurant from user's saved list. Returns True if successful."""
    conn = get_connection()
    if conn is None:
        return False

    try:
        with conn:
            with conn.cursor() as cur:
                cur.execute(
                    "DELETE FROM saved_restaurants WHERE user_id = %s AND restaurant_id = %s",
                    (user_id, restaurant_id),
                )
        return True

    except Exception as e:
        print(f"[DB] Error unsaving restaurant: {e}")
        return False
    finally:
        conn.close()


def get_search_count(email):
    """Get the search count for a signed-in user by email."""
    conn = get_connection()
    if conn is None:
        return 0

    try:
        with conn.cursor() as cur:
            cur.execute("SELECT search_count FROM users WHERE email = %s", (email.lower().strip(),))
            row = cur.fetchone()
            return row["search_count"] if row else 0
    except Exception as e:
        print(f"[DB] Error getting search count: {e}")
        return 0
    finally:
        conn.close()


def increment_search_count(email):
    """Increment the search count for a signed-in user by email."""
    conn = get_connection()
    if conn is None:
        return False

    try:
        with conn:
            with conn.cursor() as cur:
                cur.execute(
                    "UPDATE users SET search_count = search_count + 1 WHERE email = %s",
                    (email.lower().strip(),),
                )
        return True
    except Exception as e:
        print(f"[DB] Error incrementing search count: {e}")
        return False
    finally:
        conn.close()


def get_anonymous_search_count(ip_address):
    """Get the search count for an anonymous user by IP address."""
    conn = get_connection()
    if conn is None:
        return 0

    try:
        with conn.cursor() as cur:
            cur.execute("SELECT search_count FROM anonymous_usage WHERE ip_address = %s", (ip_address,))
            row = cur.fetchone()
            return row["search_count"] if row else 0
    except Exception as e:
        print(f"[DB] Error getting anonymous search count: {e}")
        return 0
    finally:
        conn.close()


def increment_anonymous_search_count(ip_address):
    """Increment the search count for an anonymous user by IP address (upsert)."""
    conn = get_connection()
    if conn is None:
        return False

    try:
        with conn:
            with conn.cursor() as cur:
                cur.execute(
                    """
                    INSERT INTO anonymous_usage (ip_address, search_count, first_searched_at, last_searched_at)
                    VALUES (%s, 1, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
                    ON CONFLICT (ip_address) DO UPDATE SET
                        search_count = anonymous_usage.search_count + 1,
                        last_searched_at = CURRENT_TIMESTAMP
                    """,
                    (ip_address,),
                )
        return True
    except Exception as e:
        print(f"[DB] Error incrementing anonymous search count: {e}")
        return False
    finally:
        conn.close()


def add_restaurant_request(name, location, email, ip):
    """Save a restaurant request. Returns True if saved."""
    conn = get_connection()
    if conn is None:
        return False

    try:
        with conn:
            with conn.cursor() as cur:
                cur.execute(
                    """
                    INSERT INTO restaurant_requests (restaurant_name, location, user_email, ip_address)
                    VALUES (%s, %s, %s, %s)
                    """,
                    (name.strip(), location.strip() if location else None,
                     email.lower().strip() if email else None, ip),
                )
        print(f"[DB] Restaurant request saved: {name} ({location})")
        return True
    except Exception as e:
        print(f"[DB] Error saving restaurant request: {e}")
        return False
    finally:
        conn.close()


def get_pending_requests():
    """Get all unfulfilled restaurant requests, oldest first."""
    conn = get_connection()
    if conn is None:
        return []

    try:
        with conn.cursor() as cur:
            cur.execute(
                """
                SELECT id, restaurant_name, location, user_email, ip_address, requested_at
                FROM restaurant_requests
                WHERE fulfilled_at IS NULL
                ORDER BY requested_at
                """
            )
            return [dict(row) for row in cur.fetchall()]
    except Exception as e:
        print(f"[DB] Error getting pending requests: {e}")
        return []
    finally:
        conn.close()


def mark_request_fulfilled(request_id):
    """Mark a restaurant request as fulfilled."""
    conn = get_connection()
    if conn is None:
        return False

    try:
        with conn:
            with conn.cursor() as cur:
                cur.execute(
                    "UPDATE restaurant_requests SET fulfilled_at = CURRENT_TIMESTAMP WHERE id = %s",
                    (request_id,),
                )
        return True
    except Exception as e:
        print(f"[DB] Error marking request fulfilled: {e}")
        return False
    finally:
        conn.close()


def add_to_waitlist(email):
    """Add an email to the Pro waitlist. Returns True if added, False on error/duplicate."""
    conn = get_connection()
    if conn is None:
        return False

    try:
        with conn:
            with conn.cursor() as cur:
                cur.execute(
                    "INSERT INTO waitlist (email) VALUES (%s) ON CONFLICT (email) DO NOTHING",
                    (email.lower().strip(),),
                )
        return True
    except Exception as e:
        print(f"[DB] Error adding to waitlist: {e}")
        return False
    finally:
        conn.close()


def get_user_saved_restaurants(user_id):
    """Get all saved restaurants for a user. Returns list of restaurant dicts."""
    conn = get_connection()
    if conn is None:
        print(f"[DB] No connection for get_user_saved_restaurants")
        return []

    print(f"[DB] Getting saved restaurants for user_id={user_id}")

    try:
        with conn.cursor() as cur:
            # First check how many saved_restaurants exist for this user
            cur.execute(
                "SELECT COUNT(*) as count FROM saved_restaurants WHERE user_id = %s",
                (user_id,)
            )
            count_row = cur.fetchone()
            print(f"[DB] Found {count_row['count']} saved_restaurants entries for user {user_id}")

            cur.execute(
                """
                SELECT r.id, r.name, r.location, r.safety_score, r.search_query,
                       sr.saved_at
                FROM saved_restaurants sr
                JOIN restaurants r ON sr.restaurant_id = r.id
                WHERE sr.user_id = %s
                ORDER BY sr.saved_at DESC
                """,
                (user_id,),
            )
            rows = cur.fetchall()

            # Extract display name from search_query or analysis_json
            results = []
            for row in rows:
                r = dict(row)
                # Use search_query for display (it has original casing)
                # search_query is "Restaurant Name Location" format
                if r.get('search_query'):
                    # If location exists, remove it from end of search_query
                    sq = r['search_query']
                    loc = r.get('location', '')
                    if loc and sq.lower().endswith(loc.lower()):
                        display_name = sq[:-len(loc)].strip()
                    else:
                        display_name = sq.split()[0] if sq else r['name']
                    # Actually, just use the search_query without location as name
                    # Better: parse from analysis_json if available
                    r['name'] = display_name if display_name else r['name'].title()
                else:
                    # Fallback: title case the normalized name
                    r['name'] = r['name'].title()

                # Title case location if it exists
                if r.get('location'):
                    r['location'] = r['location'].title()

                print(f"[DB] Saved restaurant: id={r['id']}, name={r['name']}, location={r['location']}, score={r['safety_score']}")
                results.append(r)

            print(f"[DB] Returning {len(results)} saved restaurants")
            return results

    except Exception as e:
        print(f"[DB] Error getting saved restaurants: {e}")
        import traceback
        traceback.print_exc()
        return []
    finally:
        conn.close()
