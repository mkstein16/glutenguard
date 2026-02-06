"""Read schema.sql and create tables in PostgreSQL."""

import os
import sys
import psycopg2
from dotenv import load_dotenv

load_dotenv()


def main():
    database_url = os.environ.get("DATABASE_URL")
    if not database_url:
        print("ERROR: DATABASE_URL not set in environment")
        sys.exit(1)

    schema_path = os.path.join(os.path.dirname(__file__), "schema.sql")
    with open(schema_path) as f:
        schema_sql = f.read()

    conn = psycopg2.connect(database_url)
    try:
        with conn:
            with conn.cursor() as cur:
                cur.execute(schema_sql)
        print("Tables created successfully")
    except psycopg2.errors.DuplicateTable as e:
        print(f"Tables already exist: {e.diag.message_primary}")
    except Exception as e:
        print(f"Failed to create tables: {e}")
        sys.exit(1)
    finally:
        conn.close()


if __name__ == "__main__":
    main()
