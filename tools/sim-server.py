# 模擬走行の記録を受け取るローカルサーバー（点検用）。
# 使い方: python3 tools/sim-server.py <記録ファイル> [ポート]  → http://127.0.0.1:<ポート>/index.html?sim を開く
import http.server, sys, os

OUT = sys.argv[1]
ROOT = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..')


class H(http.server.SimpleHTTPRequestHandler):
    def __init__(self, *a, **k):
        super().__init__(*a, directory=ROOT, **k)

    def do_POST(self):
        n = int(self.headers.get('Content-Length', 0))
        with open(OUT, 'ab') as f:
            f.write(self.rfile.read(n))
        self.send_response(204)
        self.end_headers()

    def log_message(self, *a):
        pass


http.server.ThreadingHTTPServer(('127.0.0.1', int(sys.argv[2]) if len(sys.argv) > 2 else 8766), H).serve_forever()
