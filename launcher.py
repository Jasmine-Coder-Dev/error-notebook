"""桌面应用入口（普通用户双击即用）。

- 自动探测空闲端口（bind 0）；
- 线程内启动 uvicorn，日志写入 ~/.cuotiji/app.log；
- 延时后自动用默认浏览器打开页面；
- 兼容 PyInstaller frozen 环境：静态资源 / catalog.json 从 sys._MEIPASS 定位。

运行方式：
    源码模式：  python launcher.py
    打包产物：  双击 dist/cuotiji（Windows 为 cuotiji.exe）
"""
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
    log = setup_logging()
    log.info('启动错题集桌面应用，资源目录：%s，数据目录：%s',
             BASE_DIR, os.environ['CUOTIJI_DATA_DIR'])

    # 延迟导入：server.main 读取上面的环境变量决定资源路径
    from server.main import app

    port = find_free_port()
    url = f'http://127.0.0.1:{port}/'
    log.info('本地服务地址：%s', url)

    config = uvicorn.Config(app, host='127.0.0.1', port=port,
                            log_level='info', log_config=None)
    server = uvicorn.Server(config)

    # 服务起来后再开浏览器（先做一次连通探测）
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
