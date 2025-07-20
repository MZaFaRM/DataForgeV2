import sys
from core.runner import Runner

if __name__ == "__main__":
    if "--debug" in sys.argv:
        print("Debug mode. Type JSON and press Enter:")
    Runner().listen()
