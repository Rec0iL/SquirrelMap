import unittest
import os
import sys

# Add project root to sys.path
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))

from backend import database
from backend.graph_engine import engine, MindmapGraphEngine
from backend.antigravity_client import antigravity_client

class TestSquirrelMapBackend(unittest.TestCase):
    def setUp(self):
        database.init_db()
        engine.reload_graph()

    def test_database_and_engine(self):
        ideas = database.get_all_ideas()
        self.assertIsInstance(ideas, list)
        data = engine.get_graph_data()
        self.assertTrue(hasattr(data, "nodes"))
        self.assertTrue(hasattr(data, "edges"))
        self.assertTrue(hasattr(data, "categories"))

    def test_model_normalization(self):
        # Empty or default
        self.assertEqual(antigravity_client._normalize_agy_model(None), "gemini-3.8-flash-low")
        self.assertEqual(antigravity_client._normalize_agy_model(""), "gemini-3.8-flash-low")
        # Claude alias mapping
        self.assertEqual(antigravity_client._normalize_agy_model("claude-sonnet-4-6"), "claude-sonnet-5-5-medium")
        self.assertEqual(antigravity_client._normalize_agy_model("claude-sonnet"), "claude-sonnet-5-5-medium")
        self.assertEqual(antigravity_client._normalize_agy_model("claude-opus"), "claude-opus-5-5-high")
        # Gemini legacy mapping
        self.assertEqual(antigravity_client._normalize_agy_model("gemini-3.1-pro-high"), "gemini-3.8-flash-high")
        self.assertEqual(antigravity_client._normalize_agy_model("gemini-3.7-flash-high"), "gemini-3.8-flash-high")
        self.assertEqual(antigravity_client._normalize_agy_model("gemini-3.8-flash-low"), "gemini-3.8-flash-low")
        self.assertEqual(antigravity_client._normalize_agy_model("gemini-3.8-flash-high"), "gemini-3.8-flash-high")
        # Argon mapping
        self.assertEqual(antigravity_client._normalize_agy_model("gemini-4-argon-high"), "gemini-4-argon-high")
        # Unknown fallback
        self.assertEqual(antigravity_client._normalize_agy_model("random-unknown-model"), "gemini-3.8-flash-low")

    def test_health_check_available_models(self):
        models = antigravity_client.check_health
        self.assertTrue(callable(models))

    def test_no_reseed_when_all_deleted(self):
        conn = database.get_connection()
        cur = conn.cursor()
        cur.execute("SELECT value FROM meta WHERE key = 'has_seeded_defaults'")
        row = cur.fetchone()
        conn.close()
        self.assertIsNotNone(row)
        self.assertIn(row[0], ["true", "1"])

if __name__ == "__main__":
    unittest.main()
