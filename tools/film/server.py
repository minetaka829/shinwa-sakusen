# 3D 映像の書き出し用ローカルサーバー（制作用）。
# 使い方: python3 tools/film/server.py [ポート]  → 書き出した動画は POST /out/<名前>.mp4 で film/ に保存される
import http.server, sys, os

ROOT = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', '..')
OUT = os.path.join(ROOT, 'film')


class H(http.server.SimpleHTTPRequestHandler):
    def __init__(self, *a, **k):
        super().__init__(*a, directory=ROOT, **k)

    def do_POST(self):
        n = int(self.headers.get('Content-Length', 0))
        name = os.path.basename(self.path)
        os.makedirs(OUT, exist_ok=True)
        dest = os.path.join(OUT, name) if self.path.startswith('/out/') else os.path.join(OUT, 'log.txt')
        with open(dest, 'ab' if dest.endswith('log.txt') else 'wb') as f:
            f.write(self.rfile.read(n))
        self.send_response(204)
        self.end_headers()

    def log_message(self, *a):
        pass


http.server.ThreadingHTTPServer(('127.0.0.1', int(sys.argv[1]) if len(sys.argv) > 1 else 8780), H).serve_forever()
