#!/usr/bin/env python3
"""
SquirrelMap Application Launcher
Starts the FastAPI server on port 8766.
"""
import sys
import os
import uvicorn

def main():
    if not getattr(sys, 'frozen', False):
        os.chdir(os.path.dirname(os.path.abspath(__file__)))
    
    port = int(os.environ.get('PORT', 8766))
    print('=' * 68)
    print('  🐿️ SQUIRRELMAP — 3D IDEA MINDMAP & AUTOMATIC SOURCING GRAPH')
    print(f'  🚀 Server running at: http://localhost:{port}')
    print('  🛒 Cross-Project Bill of Materials (BOM) & Similarity Engine Active')
    print('=' * 68)
    
    if getattr(sys, 'frozen', False):
        from backend.app import app
        uvicorn.run(app, host='127.0.0.1', port=port, reload=False, log_level='info')
    else:
        uvicorn.run('backend.app:app', host='0.0.0.0', port=port, reload=True)

if __name__ == '__main__':
    main()
