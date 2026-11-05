#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""把本地当前 HEAD 的文件树同步到 GitHub main，并触发 GitHub Pages 部署。

为什么不用 git push：本机网络对 github.com 的 git 协议（CONNECT 隧道 / 大包 POST）
不稳定或被重置，但 api.github.com 可达。这里用 Git Data API 做「增量 blob + tree +
commit + 更新 ref」，效果等价于一次 fast-forward push，且会触发 on: push 工作流。

用法（在项目根目录）：
    python tools/gh-sync.py              # 同步到 main
    python tools/gh-sync.py --check      # 只对比差异，不写任何东西
    python tools/gh-sync.py -m "说明"    # 自定义提交信息
    python tools/gh-sync.py --dispatch   # 额外手动触发一次 Pages 工作流

凭据：从 git credential（Windows 凭据管理器）读取 github.com 的 PAT，
      没有则读环境变量 GITHUB_TOKEN / GH_TOKEN。
"""
import base64
import datetime
import json
import os
import subprocess
import sys
import urllib.error
import urllib.request

try:
    sys.stdout.reconfigure(encoding='utf-8')
except Exception:
    pass

REPO = 'shexiao123/yinchuan-aigc-console'
BRANCH = 'main'
PAGES_URL = 'https://shexiao123.github.io/yinchuan-aigc-console/'
API = 'https://api.github.com'
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
CACHE_FILE = os.path.join(ROOT, 'tools', '.gh-sync-blobs.json')

# 历史素材/截图：体积大且线上运行不需要，默认跳过（--full 才同步）
EXCLUDE_PREFIXES = ('assets/', '_docs/', 'prototype/', 'shots/', 'video/out/')


def keep(path, full=False):
    return full or not path.startswith(EXCLUDE_PREFIXES)


def load_cache():
    try:
        with open(CACHE_FILE, 'r', encoding='utf-8') as f:
            return set(json.load(f))
    except Exception:
        return set()


def save_cache(cache):
    try:
        with open(CACHE_FILE, 'w', encoding='utf-8') as f:
            json.dump(sorted(cache), f)
    except Exception:
        pass


def git(*args, binary=False):
    p = subprocess.run(['git', *args], cwd=ROOT, capture_output=True)
    if p.returncode != 0:
        raise RuntimeError('git %s 失败: %s' % (' '.join(args), p.stderr.decode('utf-8', 'replace')))
    return p.stdout if binary else p.stdout.decode('utf-8').strip()


def get_token():
    p = subprocess.run(
        ['git', 'credential', 'fill'], cwd=ROOT,
        input=b'protocol=https\nhost=github.com\n\n', capture_output=True
    )
    for line in p.stdout.decode('utf-8', 'replace').splitlines():
        if line.startswith('password='):
            tok = line[9:].strip()
            if tok:
                return tok
    return os.environ.get('GITHUB_TOKEN') or os.environ.get('GH_TOKEN')


TOKEN = None


def api(path, method='GET', payload=None, retries=2):
    """优先走环境代理；失败再用直连重试。"""
    body = json.dumps(payload).encode('utf-8') if payload is not None else None
    # /user 是全局端点，其余都是仓库端点，需要拼 /repos/{owner}/{repo}
    url = (API + path) if path.startswith('/user') else (API + '/repos/' + REPO + path)
    openers = [
        urllib.request.build_opener(),
        urllib.request.build_opener(urllib.request.ProxyHandler({})),
    ]
    last = None
    for opener in openers[:retries]:
        req = urllib.request.Request(url, data=body, method=method)
        req.add_header('Authorization', 'Bearer ' + TOKEN)
        req.add_header('Accept', 'application/vnd.github+json')
        req.add_header('User-Agent', 'workbuddy-gh-sync')
        if body is not None:
            req.add_header('Content-Type', 'application/json')
        try:
            with opener.open(req, timeout=45) as r:
                raw = r.read().decode('utf-8')
                return json.loads(raw) if raw.strip() else {}
        except urllib.error.HTTPError as e:
            detail = e.read().decode('utf-8', 'replace')[:300]
            raise RuntimeError('GitHub API %s %s → HTTP %s: %s' % (method, path, e.code, detail))
        except Exception as e:
            last = e
    raise RuntimeError('GitHub API 请求失败: %s' % last)


def local_tree():
    """返回 {path: (mode, type, sha)}，用 -z 兼容中文路径。"""
    raw = git('ls-tree', '-r', '-z', 'HEAD', binary=True)
    out = {}
    for rec in raw.split(b'\0'):
        if not rec:
            continue
        meta, _, path = rec.partition(b'\t')
        parts = meta.split()
        if len(parts) != 3 or not path:
            continue
        mode, typ, sha = parts[0].decode(), parts[1].decode(), parts[2].decode()
        out[path.decode('utf-8')] = (mode, typ, sha)
    return out


def remote_tree(commit_sha, tree_sha):
    data = api('/git/trees/%s?recursive=1' % tree_sha)
    if data.get('truncated'):
        raise RuntimeError('远端 tree 被截断，仓库过大，请改用 git push')
    return {e['path']: (e['mode'], e['type'], e.get('sha') or '')
            for e in data['tree'] if e['type'] in ('blob', 'commit')}


def main():
    global TOKEN
    args = sys.argv[1:]
    check_only = '--check' in args
    dispatch = '--dispatch' in args
    full = '--full' in args
    mode = '全量' if full else '核心（跳过历史素材）'
    msg = None
    if '-m' in args:
        i = args.index('-m')
        if i + 1 < len(args):
            msg = args[i + 1]
    if not msg:
        msg = 'chore: 同步本地更新到 GitHub Pages（%s）' % datetime.datetime.now().strftime('%Y-%m-%d %H:%M')

    TOKEN = get_token()
    if not TOKEN:
        print('✗ 拿不到 GitHub PAT。请在凭据管理器里配置 github.com，或设置 GITHUB_TOKEN。')
        return 1
    who = api('/user')
    print('✓ 身份: %s' % who.get('login'))

    ref = api('/git/ref/heads/' + BRANCH)
    head_sha = ref['object']['sha']
    commit = api('/git/commits/' + head_sha)
    tree_sha = commit['tree']['sha']
    print('✓ 远端 main: %s' % head_sha[:8])

    loc = local_tree()
    rem = remote_tree(head_sha, tree_sha)
    print('✓ 本地 %d 个文件 / 远端 %d 个文件' % (len(loc), len(rem)))

    changed = sorted(p for p, v in loc.items() if rem.get(p) != v and keep(p, full))
    deleted = sorted(p for p in rem if p not in loc and keep(p, full))
    skipped = sum(1 for p, v in loc.items() if rem.get(p) != v and not keep(p, full))
    print('✓ 同步模式: %s；跳过历史素材 %d 个' % (mode, skipped))
    print('  需上传 %d 个文件，需删除 %d 个文件' % (len(changed), len(deleted)))
    if changed[:5]:
        print('  示例: ' + ', '.join(changed[:5]))
    if not changed and not deleted:
        print('✓ 远端已与本地一致，无需同步。')
        return 0
    if check_only:
        print('--check 模式，未做任何写入。')
        return 0

    total = 0
    for p in changed:
        b = git('cat-file', '-s', loc[p][2])
        total += int(b)
    print('  待上传内容合计 %.1f MB' % (total / 1048576.0))

    entries = []
    cache = load_cache()
    reused = 0
    for n, p in enumerate(changed, 1):
        entry_mode, typ, sha = loc[p]
        if typ != 'blob':
            print('  ! 跳过非 blob（子模块/符号链接）: %s' % p)
            continue
        if sha not in cache:
            content = git('cat-file', 'blob', sha, binary=True)
            blob = api('/git/blobs', 'POST', {
                'content': base64.b64encode(content).decode('ascii'),
                'encoding': 'base64'
            })
            if blob['sha'] != sha:
                raise RuntimeError('blob sha 不一致: %s（本地 %s / 远端 %s）' % (p, sha, blob['sha']))
            cache.add(sha)
            save_cache(cache)  # 中断后重跑可跳过已上传的 blob
        else:
            reused += 1
        entries.append({'path': p, 'mode': entry_mode, 'type': 'blob', 'sha': sha})
        if n % 20 == 0 or n == len(changed):
            print('  已处理 %d/%d（复用 %d）' % (n, len(changed), reused), flush=True)

    for p in deleted:
        entry_mode, typ, _ = rem[p]
        entries.append({'path': p, 'mode': entry_mode, 'type': typ, 'sha': None})

    new_tree = api('/git/trees', 'POST', {'base_tree': tree_sha, 'tree': entries})
    want_tree = git('rev-parse', 'HEAD^{tree}')
    print('✓ 新 tree: %s（本地 tree: %s）' % (new_tree['sha'][:8], want_tree[:8]), flush=True)
    align_refs = False
    if full:
        if new_tree['sha'] != want_tree:
            raise RuntimeError('新 tree 与本地 tree 不一致，已停止写入 ref，请检查差异')
        align_refs = True
    else:
        nmap = remote_tree(head_sha, new_tree['sha'])
        bad = [p for p in changed if (nmap.get(p) or ('', '', ''))[2] != loc[p][2]]
        if bad:
            raise RuntimeError('核心路径校验失败: %s' % ', '.join(bad[:5]))
        print('✓ 核心路径 %d 个已与本地一致' % len(changed), flush=True)

    new_commit = api('/git/commits', 'POST', {
        'message': msg,
        'tree': new_tree['sha'],
        'parents': [head_sha]
    })
    # 注意：GET 用 /git/ref/{ref}（单数），PATCH 用 /git/refs/{ref}（复数）
    api('/git/refs/heads/' + BRANCH, 'PATCH', {'sha': new_commit['sha'], 'force': False})
    print('✓ 已推送 commit: %s' % new_commit['sha'][:8], flush=True)

    if align_refs:
        # 全量模式下 tree 完全一致，对齐本地引用，工作区保持干净
        git('update-ref', 'refs/heads/' + BRANCH, new_commit['sha'])
        git('update-ref', 'refs/remotes/origin/' + BRANCH, new_commit['sha'])
    else:
        print('  本地 refs 未改动（远端保留历史素材旧版，不影响 docs/ 线上运行）')

    if dispatch:
        api('/actions/workflows/deploy-pages.yml/dispatches', 'POST', {'ref': BRANCH})
        print('✓ 已手动触发 Pages 工作流')

    print('✓ 线上地址: %s' % PAGES_URL)
    print('  GitHub Actions 会自动部署 docs/，通常 1-2 分钟生效。')
    return 0


if __name__ == '__main__':
    try:
        sys.exit(main())
    except Exception as e:
        print('✗ 同步失败: %s' % e)
        sys.exit(1)
