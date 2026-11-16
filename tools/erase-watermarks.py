# -*- coding: utf-8 -*-
"""批量提交去水印任务（buddy-image-processing erase），提交后统一轮询状态。
用法：python tools/erase-watermarks.py
输入：assets/ai-covers/*.png
输出：assets/ai-covers/noWM/<原名>.png
"""
import glob
import json
import os
import subprocess
import sys
import time

SKILL = r"D:\下载\WorkBuddy\resources\app.asar.unpacked\resources\plugins\workbuddy-builtin\skills\buddy-image-processing\scripts\buddy-image-processing.py"
SRC_DIR = os.environ.get("WB_ERASE_DIR", "assets/ai-covers")
OUT_DIR = os.path.join(SRC_DIR, "noWM")
PROMPT = "Remove the watermark text in the bottom-right corner"

os.makedirs(OUT_DIR, exist_ok=True)


def run(args, timeout=120):
    p = subprocess.run(args, capture_output=True, text=True, encoding="utf-8", errors="replace", timeout=timeout)
    return p.returncode, (p.stdout or "") + (p.stderr or "")


def submit(f, token):
    rc, out = run([sys.executable, SKILL, "image-edit", "--operation", "erase",
                   "--image-file", os.path.abspath(f), "--prompt", PROMPT,
                   "--no-poll", "--token", token], timeout=180)
    m = None
    for line in out.splitlines():
        line = line.strip()
        if "task" in line.lower() and ("id" in line.lower() or line.startswith("{")):
            m = line
    # 尝试从 JSON 里解析 task_id
    tid = None
    i = out.find("{")
    while i != -1:
        try:
            j = json.loads(out[i:out.find("}", i) + 1])
            tid = j.get("task_id") or j.get("taskId") or (j.get("data") or {}).get("task_id")
            if tid:
                break
        except Exception:
            pass
        i = out.find("{", i + 1)
    print("SUBMIT", os.path.basename(f)[:24], "rc=", rc, "task=", tid)
    if not tid:
        print("  RAW:", out[-600:])
    return tid


def status(tid, token):
    rc, out = run([sys.executable, SKILL, "status", tid, "--token", token], timeout=60)
    st, path = "unknown", None
    i = out.find("{")
    while i != -1:
        try:
            j = json.loads(out[i:out.rfind("}", i) + 1])
            break
        except Exception:
            i = out.find("{", i + 1)
    else:
        j = {}
    try:
        data = j.get("data") or j
        st = data.get("status") or data.get("state") or "unknown"
        rf = data.get("result_files") or data.get("resultFiles") or []
        if rf and isinstance(rf, list):
            path = rf[0].get("path") or rf[0].get("localPath")
    except Exception:
        pass
    return st, path, out


def main():
    # token 从环境变量取，避免写死在仓库里
    token = os.environ.get("WB_TEMP_TOKEN") or (sys.argv[1] if len(sys.argv) > 1 else "")
    if not token:
        print("need token")
        sys.exit(2)
    files = sorted(glob.glob(os.path.join(SRC_DIR, "*.png")))
    tasks = {}
    for f in files:
        tid = submit(f, token)
        if tid:
            tasks[tid] = f
    print("submitted", len(tasks), "of", len(files))
    deadline = time.time() + 900
    done = {}
    while tasks and time.time() < deadline:
        time.sleep(10)
        for tid in list(tasks):
            st, path, raw = status(tid, token)
            print("STATUS", tid, st, flush=True)
            if st in ("completed", "success", "succeeded", "done"):
                done[tasks[tid]] = path
                del tasks[tid]
            elif st in ("failed", "error", "cancelled"):
                print("  FAILED raw:", raw[-400:])
                del tasks[tid]
    print("=== RESULT ===")
    for f, p in done.items():
        print("DONE", os.path.basename(f)[:40], "->", p)
    if tasks:
        print("STILL PENDING:", list(tasks))


if __name__ == "__main__":
    main()
