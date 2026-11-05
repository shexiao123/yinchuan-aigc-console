"""用 GitHub API 提交文件（绕过 git 协议，适合 git push 不通时）"""
import base64
import json
import os
import subprocess
import sys
import urllib.request

REPO = 'shexiao123/yinchuan-aigc-console'
BRANCH = 'main'
LOCAL = 'D:/WorkBuddy/2026-10-21-10-58-00'


def token():
    p = subprocess.run(
        ['git', 'credential', 'fill'],
        input='protocol=https\nhost=github.com\n\n',
        capture_output=True, text=True, encoding='utf-8'
    )
    for line in p.stdout.splitlines():
        if line.startswith('password='):
            return line[9:].strip()
    return None


def api(path, method='GET', data=None):
    url = f'https://api.github.com/repos/{REPO}{path}'
    body = json.dumps(data).encode('utf-8') if data is not None else None
    req = urllib.request.Request(url, data=body, method=method)
    req.add_header('Authorization', f'Bearer {TOKEN}')
    req.add_header('Accept', 'application/vnd.github+json')
    req.add_header('User-Agent', 'workbuddy-agent')
    if body:
        req.add_header('Content-Type', 'application/json')
    opener = urllib.request.build_opener(urllib.request.ProxyHandler({}))
    with opener.open(req, timeout=40) as r:
        return json.loads(r.read().decode('utf-8'))


TOKEN = token()
if not TOKEN:
    print('  ✗ 拿不到 token')
    sys.exit(1)

files = sys.argv[1:] or ['js/config.js', 'js/api.js', 'js/app.js', 'assets/style.css']

for f in files:
    src = os.path.join(LOCAL, 'docs', f)
    if not os.path.exists(src):
        print(f'  ✗ {f} 不存在')
        continue
    with open(src, 'rb') as fh:
        b64 = base64.b64encode(fh.read()).decode('ascii')

    sha = ''
    try:
        meta = api(f'/contents/docs/{f}')
        sha = meta.get('sha', '')
    except Exception:
        pass

    payload = {
        'message': f'chore: 更新 docs/{f}',
        'content': b64,
        'branch': BRANCH
    }
    if sha:
        payload['sha'] = sha

    try:
        res = api(f'/contents/docs/{f}', 'PUT', payload)
        print(f'  ✓ {f}  {res.get("commit", {}).get("sha", "")[:8]}')
    except Exception as e:
        body = getattr(e, 'read', lambda: b'{}')().decode('utf-8', 'ignore')[:160]
        print(f'  ✗ {f}  {e}  {body}')
