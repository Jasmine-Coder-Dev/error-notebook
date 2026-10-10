"""桌面应用入口。

两种模式：
- 开发者模式（无参数）：自动探测空闲端口、启动 uvicorn、自动打开浏览器；
- Sidecar 模式（--port N，由 Tauri 壳传入）：固定端口、不开浏览器，
  日志仍写 ~/.cuotiji/app.log，退出由壳负责 kill。

运行方式：
    开发者模式：  python launcher.py
    Sidecar 模式： python-server --port 8000（PyInstaller 产物）
"""
import argparse
import logging
import os
import socket
import sys
import threading
import webbrowser
from pathlib import Path

# 定位资源目录：打包后为 _MEIPASS，源码模式为项目根
if getattr(sys, 'frozen', False):
    BASE_DIR = Path(sys._MEIPASS)
else:
    BASE_DIR = Path(__file__).resolve().parent

os.environ.setdefault('CUOTIJI_DEMO_DIR', str(BASE_DIR / 'demo'))
os.environ.setdefault('CUOTIJI_CATALOG', str(BASE_DIR / 'server' / 'catalog.json'))
os.environ.setdefault('CUOTIJI_DATA_DIR', str(Path.home() / '.cuotiji'))

import uvicorn  # noqa: E402  （须在环境变量设置之后导入 server.main）


def setup_logging() -> logging.Logger:
    data_dir = Path(os.environ['CUOTIJI_DATA_DIR'])
    data_dir.mkdir(parents=True, exist_ok=True)
    logging.basicConfig(
        filename=str(data_dir / 'app.log'),
        level=logging.INFO,
        format='%(asctime)s %(levelname)s %(name)s: %(message)s',
    )
    return logging.getLogger('cuotiji')


def find_free_port() -> int:
    s = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
    s.bind(('127.0.0.1', 0))
    port = s.getsockname()[1]
    s.close()
    return port


def main() -> None:
    parser = argparse.ArgumentParser(description='错题集本地服务入口')
    parser.add_argument('--port', type=int, default=0,
                        help='固定端口（Tauri sidecar 模式）；0 表示自动探测（开发者模式）')
    args = parser.parse_args()

    log = setup_logging()
    log.info('启动错题集本地服务，资源目录：%s，数据目录：%s，sidecar=%s',
             BASE_DIR, os.environ['CUOTIJI_DATA_DIR'], bool(args.port))

    # 延迟导入：server.main 读取上面的环境变量决定资源路径
    from server.main import app

    port = args.port or find_free_port()
    url = f'http://127.0.0.1:{port}/'
    log.info('本地服务地址：%s', url)

    config = uvicorn.Config(app, host='127.0.0.1', port=port,
                            log_level='info', log_config=None)
    server = uvicorn.Server(config)

    if args.port:
        # Sidecar 模式：不开浏览器，退出由 Tauri 壳 kill
        server.run()
        return

    # 开发者模式：服务起来后再开浏览器（先做一次连通探测）
    def open_browser() -> None:
        for _ in range(30):
            try:
                probe = socket.create_connection(('127.0.0.1', port), timeout=1)
                probe.close()
                webbrowser.open(url)
                return
            except OSError:
                threading.Event().wait(0.3)
        log.warning('服务未及时就绪，未自动打开浏览器，请手动访问 %s', url)

    threading.Thread(target=open_browser, daemon=True).start()
    server.run()


if __name__ == '__main__':
    main()
