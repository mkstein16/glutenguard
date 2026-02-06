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
    """Normalize restaurant name for cache key: lowercase and strip whitespace."""
    return " ".join(name.lower().split())


def normalize_location(location):
    """Normalize location for cache key: lowercase and strip whitespace."""
    if not location:
        return ""
    return " ".join(location.lower().split())


def get_cached_restaurant(name, location):
    """Look up a cached restaurant result. Returns the full result dict if found
    and not expired (< 30 days old), otherwise None."""
    conn = get_connection()
    if conn is None:
        return None

    norm_name = normalize_name(name)
    norm_location = normalize_location(location)
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
        return row["analysis_json"]

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
