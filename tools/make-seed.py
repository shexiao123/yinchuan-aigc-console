#!/usr/bin/env python
# -*- coding: utf-8 -*-
"""生成离线演示快照 webapp/js/seed-data.js

背景：GitHub Pages 域名不在平台云服务的 CORS 白名单里（预检 403），
部署在 Pages 上的站点读不到云数据库，整页卡在「服务暂时无法连接」。
做法：从云端拉一份只读快照打进 JS，云不可达时页面降级为
「离线演示模式」（见 webapp/js/offline.js），能浏览、不能写。

安全约定：快照只含「游客可浏览」的公开内容表；
providers / merchant_tasks 里的 owner_id（会话标识）一律剥掉，
订单、聊天、支付类表绝不入快照。

用法：python tools/make-seed.py
"""
import json
import sys
import urllib.request
from datetime import datetime, timezone, timedelta

ENDPOINT = 'https://guangying-web.app.workbuddy.host'
KEY = 'wbpk_ljDFUAeoNoNPMqrfAZpbEV_dw2NNFdJXAPww2ncGRAv3RvXicynHHtb'
OUT = 'webapp/js/seed-data.js'

# 表名 -> (REST 查询串, 需要剥离的字段)
TABLES = {
    'categories':       ('categories?select=*&order=sort_order.asc', []),
    'banners':          ('banners?select=*&order=sort_order.asc', []),
    'platform_settings': ('platform_settings?select=*&id=eq.1', []),
    'services':         ('services?select=*&status=eq.on&order=sales_count.desc', []),
    'providers':        ('providers?select=*&order=orders_done.desc', ['owner_id']),
    'service_samples':  ('service_samples?select=*&order=sort_order.asc', []),
    'announcements':    ('announcements?select=*&order=created_at.desc', []),
    'reviews':          ('reviews?select=*&order=created_at.desc', []),
    'member_plans':     ('member_plans?select=*&order=sort_order.asc', []),
    'merchant_plans':   ('merchant_plans?select=*&order=sort_order.asc', []),
    'merchant_tasks':   ('merchant_tasks?select=*&order=created_at.desc', ['owner_id']),
}


def fetch(table, query):
    url = '%s/.cloud/database/rest/%s' % (ENDPOINT, query)
    req = urllib.request.Request(url, headers={'x-wb-webapp-access-key': KEY})
    with urllib.request.urlopen(req, timeout=30) as resp:
        data = json.loads(resp.read().decode('utf-8'))
    if not isinstance(data, list):
        raise RuntimeError('%s: 非列表响应 %s' % (table, str(data)[:120]))
    return data


def strip_fields(rows, fields):
    if not fields:
        return rows
    for r in rows:
        for f in fields:
            r.pop(f, None)
    return rows


def main():
    seed = {}
    for table, (query, strip) in TABLES.items():
        rows = strip_fields(fetch(table, query), strip)
        seed[table] = rows
        print('%-18s %4d 行%s' % (table, len(rows), '（已剥 owner_id）' if strip else ''))

    now = datetime.now(timezone(timedelta(hours=8))).strftime('%Y-%m-%d %H:%M')
    body = json.dumps(seed, ensure_ascii=False, separators=(',', ':'))
    js = (
        '/* 离线演示快照 —— 由 tools/make-seed.py 自动生成（%s），勿手改。\n'
        '   用途：GitHub Pages 等连不上云数据库的环境降级为只读演示（见 js/offline.js）。 */\n'
        'window.SEED_DATA = %s;\n' % (now, body)
    )
    with open(OUT, 'w', encoding='utf-8', newline='\n') as f:
        f.write(js)
    print('-> %s（%d 字节）' % (OUT, len(js.encode('utf-8'))))


if __name__ == '__main__':
    sys.exit(main())
