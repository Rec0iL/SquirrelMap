import unittest
import os
import sys

# Add project root to sys.path
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))

from backend import database
from backend.graph_engine import engine, MindmapGraphEngine
from backend.antigravity_client import antigravity_client
from backend import whisper_service

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

    def test_whisper_availability(self):
        status = whisper_service.is_whisper_available()
        self.assertIn("available", status)
        if status.get("available"):
            self.assertIn(status.get("mode"), ["module", "cli"])
            self.assertIn("cuda", status)
            self.assertIn("device", status)
            self.assertEqual(status.get("default_model"), "base")

    def test_status_normalization_and_extraction(self):
        sample = """Here is the proposal:
---
title: ChronoFlow
status: idea
category: Kinetic Art
tags: [stepper, esp32]
---
# ChronoFlow
An overview.
## BOM
| Item | Spec |
| ESP32-S3 | Controller |
"""
        extracted = database.extract_idea_from_text(sample)
        self.assertIsNotNone(extracted)
        self.assertEqual(extracted["title"], "ChronoFlow")
        self.assertEqual(extracted["status"], "concept")
        self.assertEqual(len(extracted["bom"]), 1)

    def test_chat_history_crud(self):
        cid = "test-chat-crud"
        database.save_chat_session(cid, "Hello", "claude", "sonnet",
                                   [{"role": "user", "kind": "html", "html": "hi"}], [{"role": "user", "content": "hi"}])
        self.assertTrue(any(c["id"] == cid and c["message_count"] == 1 for c in database.list_chat_sessions()))
        database.save_chat_session(cid, "Hello 2", "claude", "sonnet", [], [])
        sess = database.get_chat_session(cid)
        self.assertEqual(sess["title"], "Hello 2")
        self.assertIsNotNone(database.delete_chat_session(cid))
        self.assertIsNone(database.get_chat_session(cid))
        self.assertIsNone(database.delete_chat_session(cid))

    def test_agent_actions(self):
        from backend import agent_actions
        from backend.models import IdeaNode, BOMItem
        a = IdeaNode(id="zz-act-a", title="Act A", bom=[BOMItem(item="ESP32", qty=1)])
        b = IdeaNode(id="zz-act-b", title="Act B", tags=["x"], bom=[BOMItem(item="LED", qty=3)])
        database.save_or_update_idea(a)
        database.save_or_update_idea(b)
        try:
            reply = ("Done.\n```squirrelmap-actions\n"
                     '[{"action":"update_idea","id":"zz-act-a","add_bom":[{"item":"esp32","qty":2}],"status":"idea"},'
                     '{"action":"add_connection","source":"zz-act-a","target":"Act B"},'
                     '{"action":"merge_ideas","keep_id":"zz-act-a","remove_id":"zz-act-b"},'
                     '{"action":"delete_idea","id":"nope"}]\n```')
            shown, results = agent_actions.process_response(reply)
            self.assertNotIn("squirrelmap-actions", shown)
            self.assertEqual([ok for ok, _ in results], [True, True, True, False])
            merged = database.get_idea_by_id("zz-act-a")
            self.assertEqual({x.item.lower(): x.qty for x in merged.bom}, {"esp32": 3, "led": 3})
            self.assertIsNone(database.get_idea_by_id("zz-act-b"))
            ok, _ = agent_actions.run_actions([{"action": "delete_idea", "id": "zz-act-a"}])[0]
            self.assertTrue(ok)
            self.assertIsNone(database.get_idea_by_id("zz-act-a"))
        finally:
            database.delete_idea("zz-act-a")
            database.delete_idea("zz-act-b")

if __name__ == "__main__":
    unittest.main()
