#!/usr/bin/env python
# -*- coding: utf-8 -*-
"""本地静态服务（用户端 8899 / 管理端 8900 共用）

替代 `python -m http.server`：后者 socket 的 request_queue_size 默认只有 5，
Chrome 打开页面时会并发拉 8+ 个脚本，末尾几个偶发 ERR_CONNECTION_REFUSED，
表现为在线人数、公告栏等脚本静默失效（控制台报错，页面却看着正常）。
这里把连接队列提到 128 并显式多线程，同时禁用本地缓存避免拿到旧代码。

用法：python tools/serve.py <port>
"""
import http.server
import os
import socketserver
import sys

ROOT = os.path.abspath(
    os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'webapp')
)


class StaticHandler(http.server.SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=ROOT, **kwargs)

    def end_headers(self):
        self.send_header('Cache-Control', 'no-store')
        super().end_headers()


class Server(socketserver.ThreadingMixIn, http.server.HTTPServer):
    request_queue_size = 128
    daemon_threads = True
    allow_reuse_address = True


if __name__ == '__main__':
    port = int(sys.argv[1]) if len(sys.argv) > 1 else 8899
    print('serving %s at http://127.0.0.1:%d' % (ROOT, port), flush=True)
    Server(('127.0.0.1', port), StaticHandler).serve_forever()
