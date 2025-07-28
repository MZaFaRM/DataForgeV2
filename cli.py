from multiprocessing import freeze_support
import sys
from core.runner import Runner

if __name__ == "__main__":
    freeze_support()
    if "--debug" in sys.argv:
        print("Debug mode. Type JSON and press Enter:")
    Runner().listen()
