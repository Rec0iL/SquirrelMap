#!/usr/bin/env python3
"""
tray_launcher.py - System Tray Launcher for SquirrelMap
Runs in the background, starts/stops the FastAPI server on port 8766,
and provides quick tray actions to open the 3D mindmap, browse stashed markdown files,
or restart the server.
"""

import sys
import os
import time
import subprocess
import webbrowser
import urllib.request

SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
PROJECT_ROOT = SCRIPT_DIR
IDEAS_DIR = os.path.join(PROJECT_ROOT, "ideas")
ICON_PATH = os.path.join(PROJECT_ROOT, "assets", "logo_64.png")
APP_URL = "http://localhost:8766"

from PyQt6.QtWidgets import (
    QApplication, QSystemTrayIcon, QMenu
)
from PyQt6.QtGui import QIcon, QAction
from PyQt6.QtCore import QTimer

class SquirrelMapTrayApp:
    def __init__(self):
        self.app = QApplication.instance() or QApplication(sys.argv)
        self.app.setQuitOnLastWindowClosed(False)

        self.server_process = None
        self.ensure_server_running()

        self.tray_icon = QSystemTrayIcon()
        if os.path.exists(ICON_PATH):
            self.tray_icon.setIcon(QIcon(ICON_PATH))
        else:
            self.tray_icon.setIcon(QIcon.fromTheme("squirrel"))

        self.tray_icon.setToolTip("🐿️ SquirrelMap — 3D Idea Mindmap (Port 8766)")

        self.menu = QMenu()
        self.setup_menu()
        self.tray_icon.setContextMenu(self.menu)

        self.tray_icon.activated.connect(self.on_tray_activated)
        self.tray_icon.show()

        # Initial notification
        self.tray_icon.showMessage(
            "SquirrelMap Online",
            "Server is running at http://localhost:8766\nClick tray icon to open.",
            QSystemTrayIcon.MessageIcon.Information,
            3000
        )

        # Health monitor timer
        self.timer = QTimer()
        self.timer.timeout.connect(self.check_server_health)
        self.timer.start(10000)

    def is_server_alive(self) -> bool:
        try:
            with urllib.request.urlopen(f"{APP_URL}/api/health", timeout=1.0) as resp:
                return resp.status == 200
        except Exception:
            return False

    def ensure_server_running(self):
        if not self.is_server_alive():
            run_script = os.path.join(PROJECT_ROOT, "run.py")
            self.server_process = subprocess.Popen(
                [sys.executable, run_script],
                cwd=PROJECT_ROOT,
                stdout=subprocess.DEVNULL,
                stderr=subprocess.DEVNULL
            )
            for _ in range(15):
                if self.is_server_alive():
                    break
                time.sleep(0.2)

    def setup_menu(self):
        self.menu.clear()

        # Open Web App
        act_open = QAction("🐿️ Open SquirrelMap", self.menu)
        act_open.triggered.connect(self.open_browser)
        self.menu.addAction(act_open)

        # Open Notes Folder
        act_folder = QAction("📁 Open Stashed Notes Folder", self.menu)
        act_folder.triggered.connect(self.open_notes_folder)
        self.menu.addAction(act_folder)

        self.menu.addSeparator()

        # Status item
        self.status_action = QAction("🟢 Server Online (Port 8766)", self.menu)
        self.status_action.setEnabled(False)
        self.menu.addAction(self.status_action)

        # Restart Server
        act_restart = QAction("🔄 Restart Server", self.menu)
        act_restart.triggered.connect(self.restart_server)
        self.menu.addAction(act_restart)

        self.menu.addSeparator()

        # Quit
        act_quit = QAction("❌ Quit & Stop Server", self.menu)
        act_quit.triggered.connect(self.quit_app)
        self.menu.addAction(act_quit)

    def check_server_health(self):
        alive = self.is_server_alive()
        if hasattr(self, "status_action") and self.status_action:
            if alive:
                self.status_action.setText("🟢 Server Online (Port 8766)")
            else:
                self.status_action.setText("🔴 Server Offline (Restarting...)")
                self.ensure_server_running()

    def on_tray_activated(self, reason):
        if reason in (
            QSystemTrayIcon.ActivationReason.Trigger,
            QSystemTrayIcon.ActivationReason.DoubleClick
        ):
            self.open_browser()

    def open_browser(self):
        self.ensure_server_running()
        webbrowser.open(APP_URL)

    def open_notes_folder(self):
        os.makedirs(IDEAS_DIR, exist_ok=True)
        try:
            subprocess.Popen(["xdg-open", IDEAS_DIR])
        except Exception as e:
            print(f"Error opening folder: {e}")

    def restart_server(self):
        if self.server_process:
            try:
                self.server_process.terminate()
                self.server_process.wait(timeout=2.0)
            except Exception:
                try:
                    self.server_process.kill()
                except Exception:
                    pass
            self.server_process = None

        time.sleep(0.5)
        self.ensure_server_running()
        self.tray_icon.showMessage(
            "SquirrelMap",
            "Server restarted successfully.",
            QSystemTrayIcon.MessageIcon.Information,
            2000
        )
        self.check_server_health()

    def quit_app(self):
        if self.server_process:
            try:
                self.server_process.terminate()
                self.server_process.wait(timeout=2.0)
            except Exception:
                try:
                    self.server_process.kill()
                except Exception:
                    pass
        self.app.quit()

    def run(self):
        return self.app.exec()

def main():
    tray_app = SquirrelMapTrayApp()
    sys.exit(tray_app.run())

if __name__ == "__main__":
    main()
