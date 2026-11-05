#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
内容盒子 PWA · 新链接迁移工具（路径二兜底用）

当「换新设备直接覆盖原链接」(路径一) 失败时，平台会新建一个带【新 host + 新
sharecode】的链接。本工具把项目里写死的原链接标识一次性改成新链接的值，并做
完整性自检，让新设备上的新助理能一键把项目纠正成「新链接自洽版」。

覆盖的替换面（基于代码实际 grep 结果）：
  1) sharecode 全局替换（含 5 处非图片 URL：官网 / apkUrl / buttonUrl / links 地址 /
     后台兜底回落，以及所有 html / js / manifest 里资源加载的 `?sharecode=`）；
  2) host 全局替换（content.json 的 5 处 URL、js/app.js 的 aboutQrUrl、
     js/admin.js 的 PUBLIC_ORIGIN）；
  3) 复用 externalize_images.py --sharecode 重签 18 处外置图片路径；
  4) 升 SW 壳版本（sw.js CACHE + app.js 注册 `&v=` + meta.json 三处同号）；
  5) 把 USE_GITHUB_SYNC 改回 true，恢复「覆盖仓库 content.json 即同步」的旧玩法
     （store.js 与 guide.html 两处开关）；并在 --apply 时自动 git 提交并推送 GitHub，
     让【新链接】直接成为「覆盖仓库即发布」的内容源（旧链接已解耦，不受影响）。

⚠️ 安全约束
  - 默认 --dry-run，绝不写任何文件。
  - 本工具【绝不发布 / 部署】，但 --apply 会 git 提交并推送 GitHub（仅绑定内容源，
    不涉及部署）。用 --no-push 可跳过推送。发布仍需人工在用户明确授权后由助理单独执行。
  - 所有改动都在 git 跟踪内，任何失误都可 `git checkout -- .` 回滚。
  - 自检不通过时打印 FAIL 并给出回滚命令，但不会自动部署。

典型用法
--------
  # 1) 先看会改什么（不写文件）
  python tools/migrate_to_new_link.py --dry-run \
      --new-host content-box-XXXXX.app.workbuddy.host --new-sharecode NEWCODE

  # 2) 实际替换（仍不发布）
  python tools/migrate_to_new_link.py --apply \
      --new-host content-box-XXXXX.app.workbuddy.host --new-sharecode NEWCODE

  # 3) 只做完整性自检（不写文件）
  python tools/migrate_to_new_link.py --check \
      --new-host content-box-XXXXX.app.workbuddy.host --new-sharecode NEWCODE
"""

import argparse
import json
import os
import re
import subprocess
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent          # <root>/tools
ROOT = HERE.parent                               # <root>
OLD_HOST = 'content-box-24323.app.workbuddy.host'
OLD_SC = 'AK6QIELR67'

# 含 sharecode 字面量的【项目】文件（不含 .md / .txt 文档、不含 assets 二进制、
# 不含 tools/ —— externalize_images.py 的 DEFAULT_SHARECODE 与本工具 OLD_SC 都合法
# 持有旧值，绝不能被文本替换污染）。图片路径重签由 run_externalize() 子进程完成。
SC_FILES = [
    'guide.html', 'content.json', 'index.html', 'admin.html', 'preview.html',
    'download.html', 'manifest.webmanifest', 'sw.js',
    'js/store.js', 'js/app.js', 'js/admin.js',
]
# 含原 host 字面量的代码文件
HOST_FILES = ['content.json', 'js/app.js', 'js/admin.js']


def setup_stdout():
    try:
        if hasattr(sys.stdout, 'reconfigure'):
            sys.stdout.reconfigure(encoding='utf-8')
    except Exception:
        pass


def read_text(p):
    return Path(p).read_bytes().decode('utf-8-sig')


def write_text(p, text):
    Path(p).write_bytes(text.encode('utf-8'))


def get_sw_version():
    t = read_text(ROOT / 'sw.js')
    m = re.search(r"const CACHE\s*=\s*'contentbox-v(\d+)'", t)
    return int(m.group(1)) if m else None


def bump_sw(new_v):
    """sw.js CACHE + app.js 注册 &v= + meta.json.sw 三处同号自增。返回改了哪些文件。"""
    changed = []
    # sw.js
    sp = ROOT / 'sw.js'
    t = read_text(sp)
    nt = re.sub(r"(const CACHE\s*=\s*'contentbox-v)\d+(')", r'\g<1>%d\g<2>' % new_v, t)
    if nt != t:
        write_text(sp, nt); changed.append('sw.js')
    # app.js 注册
    ap = ROOT / 'js/app.js'
    t = read_text(ap)
    nt = re.sub(r"(sw\.js\?sharecode=[^&]*&v=)\d+", r'\g<1>%d' % new_v, t)
    if nt != t:
        write_text(ap, nt); changed.append('js/app.js')
    # meta.json
    mp = ROOT / 'meta.json'
    if mp.is_file():
        t = read_text(mp)
        try:
            d = json.loads(t)
            if d.get('sw') != 'contentbox-v%d' % new_v:
                d['sw'] = 'contentbox-v%d' % new_v
                write_text(mp, json.dumps(d, ensure_ascii=False, indent=2))
                changed.append('meta.json')
        except Exception:
            pass
    return changed


def replace_in_file(rel, old, new):
    """返回 (changed:bool, count:int)"""
    p = ROOT / rel
    if not p.is_file():
        return False, 0
    t = read_text(p)
    cnt = t.count(old)
    if cnt == 0:
        return False, 0
    write_text(p, t.replace(old, new))
    return True, cnt


def run_externalize(new_sc, apply):
    """复用外置工具重签 18 张图片路径。"""
    cmd = [sys.executable, str(HERE / 'externalize_images.py'),
           '--sharecode', new_sc, '--root', str(ROOT)]
    if not apply:
        cmd.append('--dry-run')
    print('--- 调用 externalize_images.py 重签图片路径 ---')
    r = subprocess.run(cmd, capture_output=True, text=True, encoding='utf-8')
    print(r.stdout)
    if r.stderr:
        print(r.stderr)
    return r.returncode == 0


def rebind_github():
    """把 USE_GITHUB_SYNC 改回 true，恢复「覆盖仓库 content.json 即同步」的玩法（新链接用）。
    把解耦后的旧链接仓库，重新变成【绑定 GitHub、覆盖仓库即发布】的新链接内容源。"""
    changed = []
    for rel in ['js/store.js', 'guide.html']:
        p = ROOT / rel
        if not p.is_file():
            continue
        t = read_text(p)
        nt = re.sub(r'USE_GITHUB_SYNC\s*=\s*false', 'USE_GITHUB_SYNC = true', t)
        if nt != t:
            write_text(p, nt)
            changed.append(rel)
    return changed


def validate(new_host, new_sc, old_host=OLD_HOST, old_sc=OLD_SC):
    """自检：残留旧标识、content.json 合法、图片齐全、SW 一致。返回 (ok, lines)。"""
    lines = []
    ok = True

    # 1) 旧标识残留（按传入的旧标识查，支持任意来源链接迁移）
    for rel in SC_FILES + HOST_FILES:
        p = ROOT / rel
        if not p.is_file():
            continue
        t = read_text(p)
        h = t.count(old_host); s = t.count(old_sc)
        if h or s:
            ok = False
            lines.append('  ✗ %s 仍含旧 host×%d / 旧 sharecode×%d' % (rel, h, s))
    if not any('✗' in l for l in lines):
        lines.append('  ✓ 代码中已无旧 host / 旧 sharecode 残留')

    # 2) content.json 合法 + 图片齐全
    cp = ROOT / 'content.json'
    try:
        data = json.loads(read_text(cp))
        lines.append('  ✓ content.json 合法 JSON')
    except Exception as e:
        ok = False
        lines.append('  ✗ content.json 解析失败: ' + str(e)[:80])
        data = None
    if data is not None:
        refs = []
        def collect(n):
            if isinstance(n, dict):
                for v in n.values():
                    collect(v)
            elif isinstance(n, list):
                for v in n:
                    collect(v)
            elif isinstance(n, str) and n.startswith('assets/'):
                refs.append(n)
        collect(data)
        missing = sorted({r.split('?')[0] for r in refs
                          if not (ROOT / r.split('?')[0]).is_file()})
        if missing:
            ok = False
            lines.append('  ✗ %d 处图片文件缺失:' % len(missing))
            for f in missing[:20]:
                lines.append('      - ' + f)
        else:
            lines.append('  ✓ %d 处外置图片引用全部有对应文件' % len(refs))

    # 3) 新标识到位
    for rel, token in [('js/admin.js', new_host), ('js/app.js', new_host)]:
        if token and (ROOT / rel).is_file() and token in read_text(ROOT / rel):
            lines.append('  ✓ %s 已指向新 host' % rel)
        else:
            ok = False
            lines.append('  ✗ %s 未找到新 host' % rel)

    # 4) SW 三处一致
    v = get_sw_version()
    mp = ROOT / 'meta.json'
    meta_sw = None
    if mp.is_file():
        try:
            meta_sw = json.loads(read_text(mp)).get('sw')
        except Exception:
            pass
    ap = ROOT / 'js/app.js'
    ap_v = None
    if ap.is_file():
        m = re.search(r'sw\.js\?sharecode=[^&]*&v=(\d+)', read_text(ap))
        if m:
            ap_v = int(m.group(1))
    if v is not None and ap_v == v and meta_sw == 'contentbox-v%d' % v:
        lines.append('  ✓ SW 三处一致: contentbox-v%d' % v)
    else:
        ok = False
        lines.append('  ✗ SW 不一致: sw.js=v%s app.js=v%s meta=%s'
                     % (v, ap_v, meta_sw))

    return ok, lines


def main():
    setup_stdout()
    p = argparse.ArgumentParser(description='新链接迁移：把原 host/sharecode 替换为新值并自检')
    p.add_argument('--new-host', required=True, help='新链接 host，如 content-box-XXXXX.app.workbuddy.host')
    p.add_argument('--new-sharecode', required=True, help='新链接 sharecode')
    p.add_argument('--old-host', default=OLD_HOST)
    p.add_argument('--old-sharecode', default=OLD_SC)
    p.add_argument('--new-sw-version', type=int, default=None,
                   help='指定新 SW 壳版本号（默认当前 +1）')
    g = p.add_mutually_exclusive_group()
    g.add_argument('--dry-run', action='store_true', help='只预览，不写文件（默认）')
    g.add_argument('--apply', action='store_true', help='实际替换（仍不发布）')
    g.add_argument('--check', action='store_true', help='只做自检，不写文件')
    p.add_argument('--no-push', action='store_true',
                   help='迁移后不自动 git 提交/推送 GitHub（默认会推送，使新链接成为「覆盖仓库即发布」源）')
    args = p.parse_args()

    mode = 'check' if args.check else ('apply' if args.apply else 'dry-run')
    print('=' * 64)
    print('内容盒子 · 新链接迁移工具  [%s 模式]' % mode)
    print('  旧 host       : ' + args.old_host)
    print('  旧 sharecode  : ' + args.old_sharecode)
    print('  新 host       : ' + args.new_host)
    print('  新 sharecode  : ' + args.new_sharecode)
    print('=' * 64)

    if mode == 'check':
        ok, lines = validate(args.new_host, args.new_sharecode, args.old_host, args.old_sharecode)
        print('自检结果:')
        for l in lines:
            print(l)
        print('\n结论: ' + ('PASS ✅' if ok else 'FAIL ❌（见上，回滚：git checkout -- .）'))
        return 0 if ok else 1

    # dry-run / apply 都先跑外置工具重签图片（dry-run 时它也不写）
    ext_ok = run_externalize(args.new_sharecode, apply=(mode == 'apply'))

    if mode == 'dry-run':
        print('--- 预览：将执行以下替换 ---')
        seen = {}
        for rel in SC_FILES + HOST_FILES:
            if rel in seen:
                continue
            seen[rel] = True
            p2 = ROOT / rel
            if not p2.is_file():
                continue
            t = read_text(p2)
            sc = t.count(args.old_sharecode)
            ho = t.count(args.old_host)
            if sc or ho:
                print('  %s : sharecode×%d  host×%d' % (rel, sc, ho))
        cur = get_sw_version()
        nxt = (args.new_sw_version or (cur + 1)) if cur is not None else '?'
        print('  SW 壳版本 : contentbox-v%s -> contentbox-v%s' % (cur, nxt))
        print('\n[dry-run] 未写入任何文件。加 --apply 才真正替换（仍不发布）。')
        return 0 if ext_ok else 1

    # ---- apply ----
    print('--- 实际替换 ---')
    total = 0
    for rel in SC_FILES:
        ch, c = replace_in_file(rel, args.old_sharecode, args.new_sharecode)
        if ch:
            print('  ✓ %s : sharecode ×%d' % (rel, c)); total += c
    for rel in HOST_FILES:
        ch, c = replace_in_file(rel, args.old_host, args.new_host)
        if ch:
            print('  ✓ %s : host ×%d' % (rel, c)); total += c

    cur = get_sw_version()
    nxt = args.new_sw_version if args.new_sw_version else (cur + 1 if cur is not None else None)
    if nxt is not None:
        ch = bump_sw(nxt)
        if ch:
            print('  ✓ SW 升壳: ' + ', '.join(ch) + ' -> contentbox-v%d' % nxt)

    print('\n共替换 %d 处。重新绑定 GitHub 同步...' % total)
    rb = rebind_github()
    if rb:
        print('  ✓ 重新绑定 GitHub 同步: ' + ', '.join(rb) + ' (USE_GITHUB_SYNC=true)')

    ok, lines = validate(args.new_host, args.new_sharecode, args.old_host, args.old_sharecode)
    for l in lines:
        print(l)

    print('\n' + ('=' * 64))
    if ok:
        print('替换 + 重绑 GitHub 完成且自检 PASS ✅')
        if args.no_push:
            print('（--no-push：未推 GitHub。手动执行 git add -A && git commit && git push origin main）')
        else:
            print('--- 绑定 GitHub：提交并推送（使新链接成为「覆盖仓库即发布」源）---')
            try:
                subprocess.run(['git', 'add', '-A'], check=True, cwd=str(ROOT))
                subprocess.run(['git', 'commit', '-m',
                                '迁移到新链接 %s（已重绑 GitHub 同步）' % args.new_host],
                               check=True, cwd=str(ROOT))
                subprocess.run(['git', 'push', 'origin', 'main'], check=True, cwd=str(ROOT))
                print('  ✓ 已推送 GitHub：以后覆盖仓库 content.json 即可同步新链接')
            except subprocess.CalledProcessError as e:
                print('  ✗ git 提交/推送失败：%s（可手动补推，不影响本地替换）' % e)
        print('下一步（由助理执行，本工具不发布）：')
        print('  1) 把 assets/ 与原链接一样部署上线（图片必须随项目部署）')
        print('  2) ⚠️ 在用户明确同意【上线新链接】之前，不得 userAskedToPublish=true')
    else:
        print('替换完成但自检 FAIL ❌')
        print('请勿发布！先排查上面对勾处，或回滚：git checkout -- .')
    print('=' * 64)
    return 0 if ok else 1


if __name__ == '__main__':
    sys.exit(main())
