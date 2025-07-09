import sys
from core.populator import BasePopulator

if __name__ == "__main__":
    if "--debug" in sys.argv:
        print("Debug mode. Type JSON and press Enter:")
    BasePopulator().listen()
