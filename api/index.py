import os
import sys

# Ensure root directory and backend directory are in python sys.path
root_dir = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
backend_dir = os.path.join(root_dir, "backend")

for p in (root_dir, backend_dir):
    if p not in sys.path:
        sys.path.insert(0, p)

from backend.app.main import app
