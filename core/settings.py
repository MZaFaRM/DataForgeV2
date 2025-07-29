import os

BASE_PATH = os.path.join(os.path.expanduser("~"), ".datasmith")
DB_PATH = os.path.join(BASE_PATH, "config.db")
LOG_PATH = os.path.join(BASE_PATH, "logs")

os.makedirs(os.path.dirname(DB_PATH), exist_ok=True)
os.makedirs(LOG_PATH, exist_ok=True)
