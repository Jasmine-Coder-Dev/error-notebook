# -*- mode: python ; coding: utf-8 -*-
"""PyInstaller 配置：输出 Tauri sidecar 二进制 python-server。

产物由 build_macos.sh / build_windows.bat 放到
src-tauri/binaries/python-server-<target-triple>，供 Tauri externalBin 嵌入。

datas：demo/ 整个静态目录 + server/catalog.json 打进包内，
运行时由 launcher.py 通过 sys._MEIPASS 定位。
"""
from PyInstaller.utils.hooks import collect_submodules

hiddenimports = []
for pkg in ('uvicorn', 'fastapi', 'starlette', 'openai', 'httpx', 'anyio',
            'pydantic', 'email_validator', 'multipart', 'server'):
    try:
        hiddenimports += collect_submodules(pkg)
    except Exception:
        pass
hiddenimports += ['server.main', 'server.ai', 'server.prompts',
                  'server.providers', 'server.db']

a = Analysis(
    ['launcher.py'],
    pathex=[],
    binaries=[],
    datas=[('demo', 'demo'), ('server/catalog.json', 'server')],
    hiddenimports=hiddenimports,
    hookspath=[],
    hooksconfig={},
    runtime_hooks=[],
    excludes=['tkinter', 'matplotlib', 'numpy', 'pandas'],
    noarchive=False,
)
pyz = PYZ(a.pure)

exe = EXE(
    pyz,
    a.scripts,
    a.binaries,
    a.zipfiles,
    a.datas,
    [],
    name='python-server',
    debug=False,
    bootloader_ignore_signals=False,
    strip=False,
    upx=False,
    upx_exclude=[],
    runtime_tmpdir=None,
    console=True,
    disable_windowed_traceback=False,
    argv_emulation=False,
    target_arch=None,
    codesign_identity=None,
    entitlements_file=None,
)
