import unittest
import os
import sys

# Add project root to sys.path
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))

from backend import database
from backend.graph_engine import GraphEngine

class TestBackend(unittest.TestCase):
    def setUp(self):
        database.init_db()
        self.engine = GraphEngine()

    def test_database_seed_exists(self):
        skills = database.get_all_skills()
        self.assertGreater(len(skills), 25, "Seed skills should be populated")
        edges = database.get_all_edges()
        self.assertGreater(len(edges), 20, "Seed edges should be populated")
        conflicts = database.get_all_conflicts()
        self.assertGreater(len(conflicts), 1, "Seed conflicts should be populated")

    def test_node_dynamic_sizing_and_centrality(self):
        self.assertIn("dexterity-coordination", self.engine.skills_map)
        dex_node = self.engine.skills_map["dexterity-coordination"]
        self.assertGreater(dex_node.size, 5.0, "Foundational hubs should have enlarged sizes")

    def test_asymmetric_transfer_math(self):
        # Downward transfer: Aircraft Mechanic (Tier 3) -> Scooter Maintenance (Tier 1)
        factor_down = self.engine.calculate_transfer_factor("aircraft-mechanic", "scooter-maintenance", base_weight=0.8)
        self.assertEqual(factor_down, 0.8, "Downward transfer ratio should be 1.0 (full weight)")

        # Upward transfer: Scooter Maintenance (Tier 1) -> Aircraft Mechanic (Tier 3)
        factor_up = self.engine.calculate_transfer_factor("scooter-maintenance", "aircraft-mechanic", base_weight=0.8)
        expected_up = round(0.8 * (1.0 / 3.0), 4)
        self.assertEqual(factor_up, expected_up, "Upward transfer should be dampened by T_source / T_target")

    def test_calibration_propagation(self):
        res = self.engine.calibrate({"car-mechanic": 80.0})
        # Should have boosted scooter maintenance
        self.assertIn("scooter-maintenance", res.proficiencies)
        self.assertGreater(res.proficiencies["scooter-maintenance"], 20.0)

        # Should have boosted foundational attribute dexterity-coordination
        self.assertIn("dexterity-coordination", res.proficiencies)
        self.assertGreater(res.proficiencies["dexterity-coordination"], 30.0)

    def test_mutual_exclusivity_conflict(self):
        res = self.engine.calibrate({
            "radical-pacifism": 85.0,
            "close-quarters-lethal": 70.0
        })
        self.assertGreater(len(res.conflicts_detected), 0, "Conflict should be detected between pacifism and lethal combat")

    def test_semantic_auto_linker(self):
        suggestions = self.engine.suggest_links(limit=5)
        self.assertIsInstance(suggestions, list)
        if len(suggestions) > 0:
            self.assertGreaterEqual(suggestions[0].confidence, 0.5)

if __name__ == "__main__":
    unittest.main()
