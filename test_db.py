import os
from dotenv import load_dotenv
import psycopg2

# Load the .env file so we can access DATABASE_URL
load_dotenv()

# Try to connect
try:
    conn = psycopg2.connect(os.getenv("DATABASE_URL"))
    print("✅ SUCCESS! Connected to database")

    # Close the connection (clean up)
    conn.close()

except Exception as e:
    print("❌ FAILED to connect")
    print(f"Error: {e}")
