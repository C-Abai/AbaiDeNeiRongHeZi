#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
内容盒子 PWA · 图片外置工具（v87 起）

用途
----
后台上传/重传图片时，图片会以 base64 内联进 content.json，改一张图就可能让
文件从 20KB 涨到 100–500KB，拖慢 GitHub 同步。本脚本把内联图片按内容哈希
外置成 assets/ 下的独立文件，并把字段值替换成可直接当 img src 使用的相对
路径，让 content.json 重新瘦回文字体积。

特性
----
- 幂等：重复运行不会重复生成文件、不会改动已外置的路径。
- 去重：同一张图被多处引用时只落盘一次（沿用 v87 的 img-<sha256前12位> 命名）。
- 兼容：公开端 / 后台 / 引导页 / 更新弹窗都是直接把字段值当 URL 用，无需改渲染代码。
- 换链接：--sharecode 可一次性重签全部 assets 引用，避免迁移后图片 404。
- 无第三方依赖，仅用 Python 标准库；Python 3.7+ 可用。

典型用法
--------
  # 预览会做什么（不写任何文件）
  python tools/externalize_images.py --dry-run

  # 实际执行：改图并导出 content.json 覆盖到项目根后运行
  python tools/externalize_images.py

  # 换到新链接后，把全部图片路径的门禁码改成新值
  python tools/externalize_images.py --sharecode NEWCODE

  # 校验所有外置引用对应的图片文件是否齐全
  python tools/externalize_images.py --verify

⚠️ 关键：只要生成了新的 assets 图片文件，就必须把 assets/ 随项目一起
   【重新部署上线】，然后再把瘦身后的 content.json 推到 GitHub。
   只覆盖 content.json 而不部署，访客会拿到指向不存在图片的引用 → 破图。
"""

import argparse
import base64
import binascii
import hashlib
import json
import os
import re
import sys
from pathlib import Path

DEFAULT_SHARECODE = 'AK6QIELR67'
DATA_URL_RE = re.compile(r'^data:image/([A-Za-z0-9.+-]+);base64,(.*)$', re.S)
ASSET_REF_RE = re.compile(r'^assets/([A-Za-z0-9._-]+)(\?.*)?$')
SHARECODE_RE = re.compile(r'[?&]sharecode=([^&\s]+)')

EXT_MAP = {
    'jpeg': 'jpg', 'jpg': 'jpg', 'png': 'png', 'webp': 'webp', 'gif': 'gif',
    'svg+xml': 'svg', 'bmp': 'bmp', 'avif': 'avif', 'ico': 'ico',
    'x-icon': 'ico', 'vnd.microsoft.icon': 'ico',
}


def setup_stdout():
    """Windows 控制台可能是 GBK，强制 UTF-8 避免中文输出崩溃。"""
    try:
        if hasattr(sys.stdout, 'reconfigure'):
            sys.stdout.reconfigure(encoding='utf-8')
    except Exception:
        pass


def iter_strings(node):
    if isinstance(node, str):
        yield node
    elif isinstance(node, dict):
        for v in node.values():
            for s in iter_strings(v):
                yield s
    elif isinstance(node, list):
        for v in node:
            for s in iter_strings(v):
                yield s


def detect_sharecode(data, fallback):
    for s in iter_strings(data):
        m = SHARECODE_RE.search(s)
        if m:
            return m.group(1)
    return fallback


def safe_ext(mime):
    m = mime.lower()
    if m in EXT_MAP:
        return EXT_MAP[m]
    cleaned = re.sub(r'[^a-z0-9]', '', m)[:8]
    return cleaned or 'bin'


class Ctx:
    def __init__(self, assets_dir, sharecode, resign):
        self.assets_dir = assets_dir
        self.sharecode = sharecode
        self.resign = resign
        self.pending = {}      # filename -> bytes（尚未落盘）
        self.reused = 0        # 命中已存在文件
        self.inlined = 0       # 处理的内联图片引用数
        self.refs = 0          # 遇到的外置引用数
        self.resigned = 0      # 重签的引用数
        self.errors = []       # 解码失败等
        self.new_files = []    # 本次真正新建的文件名


def convert_string(s, ctx):
    # 1) 内联 base64 图片 → 外置文件
    m = DATA_URL_RE.match(s)
    if m:
        mime, payload = m.group(1), re.sub(r'\s+', '', m.group(2))
        try:
            raw = base64.b64decode(payload, validate=False)
        except (binascii.Error, ValueError) as e:
            ctx.errors.append('base64 解码失败（已保留原值）: ' + str(e)[:60])
            return s
        if not raw:
            ctx.errors.append('base64 图片为空（已保留原值）')
            return s
        ext = safe_ext(mime)
        name = 'img-' + hashlib.sha256(raw).hexdigest()[:12] + '.' + ext
        if (ctx.assets_dir / name).exists() or name in ctx.pending:
            ctx.reused += 1                 # 命中已有文件，或本批内已去重
        else:
            ctx.pending[name] = raw
        ctx.inlined += 1
        return 'assets/' + name + '?sharecode=' + ctx.sharecode

    # 2) 已外置引用：仅在显式指定新门禁码时重签
    m2 = ASSET_REF_RE.match(s)
    if m2:
        ctx.refs += 1
        if ctx.resign:
            new = 'assets/' + m2.group(1) + '?sharecode=' + ctx.sharecode
            if new != s:
                ctx.resigned += 1
            return new
        return s

    return s


def transform(node, ctx):
    if isinstance(node, dict):
        return {k: transform(v, ctx) for k, v in node.items()}
    if isinstance(node, list):
        return [transform(v, ctx) for v in node]
    if isinstance(node, str):
        return convert_string(node, ctx)
    return node


def build_parser():
    here = Path(__file__).resolve().parent
    root = here.parent
    p = argparse.ArgumentParser(
        description='把 content.json 里的内联 base64 图片外置到 assets/（可重复运行）')
    p.add_argument('--root', default=str(root), help='项目根目录（默认脚本所在项目的根）')
    p.add_argument('--content', default=None, help='content.json 路径（默认 <root>/content.json）')
    p.add_argument('--assets', default=None, help='assets 目录（默认 <root>/assets）')
    p.add_argument('--sharecode', default=None,
                   help='显式指定门禁码，重写全部 assets 图片引用的 query（换链接时用；'
                        '非图片 URL 如 apkUrl / 官网 / links 地址不在此工具职责内）')
    p.add_argument('--dry-run', action='store_true', help='只预览，不写任何文件')
    p.add_argument('--verify', action='store_true',
                   help='只校验所有外置引用对应的图片文件是否存在，不写任何文件')
    p.add_argument('--backup', action='store_true', help='改写前备份为 content.json.bak')
    return p


def main():
    setup_stdout()
    args = build_parser().parse_args()
    root = Path(args.root).resolve()
    content_path = Path(args.content).resolve() if args.content else root / 'content.json'
    assets_dir = Path(args.assets).resolve() if args.assets else root / 'assets'

    if not content_path.is_file():
        print('错误：找不到 content.json -> ' + str(content_path))
        return 1

    try:
        original_bytes = content_path.read_bytes()
        text = original_bytes.decode('utf-8-sig')
        data = json.loads(text)
    except Exception as e:
        print('错误：content.json 无法解析 -> ' + str(e))
        return 1

    inferred = detect_sharecode(data, DEFAULT_SHARECODE)
    resign = args.sharecode is not None
    sharecode = args.sharecode if resign else inferred

    print('项目根   : ' + str(root))
    print('内容文件 : ' + str(content_path))
    print('图片目录 : ' + str(assets_dir))
    print('门禁码   : ' + sharecode + ('  [显式指定，将重签全部引用]' if resign else '  [从现有引用推断]'))
    print('')

    ctx = Ctx(assets_dir, sharecode, resign)
    result = transform(data, ctx)

    if ctx.errors:
        print('以下图片未能处理，为避免破图，本次【不写入任何文件】：')
        for e in ctx.errors:
            print('  - ' + e)
        return 1

    out_bytes = json.dumps(result, ensure_ascii=False, indent=2).encode('utf-8')
    new_files = sorted(n for n in ctx.pending if not (assets_dir / n).exists())

    print('内联图片 : %d 处  -> 新建 %d 张 / 复用 %d 张'
          % (ctx.inlined, len(new_files), ctx.reused))
    print('外置引用 : %d 处  (重签 %d 处)' % (ctx.refs + ctx.inlined, ctx.resigned))
    print('文件体积 : %s -> %s 字节' % (format(len(original_bytes), ','), format(len(out_bytes), ',')))
    print('')

    if args.verify:
        refs = []
        def collect(node):
            if isinstance(node, dict):
                for v in node.values():
                    collect(v)
            elif isinstance(node, list):
                for v in node:
                    collect(v)
            elif isinstance(node, str) and node.startswith('assets/'):
                refs.append(node)
        collect(result)
        missing = sorted({r.split('?')[0] for r in refs
                          if not (root / r.split('?')[0]).is_file()})
        if missing:
            print('校验失败：以下图片文件缺失（%d 个）:' % len(missing))
            for f in missing:
                print('  - ' + f)
            return 1
        print('校验通过：%d 处外置引用全部有对应图片文件。' % len(refs))
        print('[verify] 仅校验，未写入任何文件。')
        return 0

    if args.dry_run:
        if new_files:
            print('[dry-run] 将新建图片:')
            for n in new_files:
                print('  - assets/' + n)
        print('[dry-run] 未写入任何文件。')
        return 0

    if args.backup:
        bak = content_path.with_suffix(content_path.suffix + '.bak')
        bak.write_bytes(original_bytes)
        print('已备份 -> ' + str(bak))

    if new_files or ctx.pending:
        assets_dir.mkdir(parents=True, exist_ok=True)
        for name, raw in sorted(ctx.pending.items()):
            target = assets_dir / name
            if not target.exists():
                target.write_bytes(raw)
        ctx.new_files = new_files

    if out_bytes != original_bytes:
        content_path.write_bytes(out_bytes)
        print('已写入 ' + str(content_path))
    else:
        print('内容无变化，content.json 未改动。')

    print('')
    if ctx.new_files:
        print('本次新建图片 %d 张:' % len(ctx.new_files))
        for n in ctx.new_files:
            print('  - assets/' + n)
        print('')
        print('⚠️  必须重新部署一次！只把 content.json 覆盖到 GitHub 而不部署，')
        print('   访客会拿到指向线上尚不存在图片的引用，出现破图。')
        print('   顺序：确认 assets/ 随项目一起部署上线 → 再推 content.json → 访客重开 App。')
    elif resign and ctx.resigned:
        print('已完成 %d 处图片引用的门禁码重签。文件名是内容哈希、不需要变，' % ctx.resigned)
        print('但部署到新链接时 assets/ 目录仍必须一起带上（见 HANDOVER §5d）。')
        leftover = sum(1 for s in iter_strings(result)
                       if not s.startswith('assets/') and inferred and inferred in s)
        if leftover:
            print('')
            print('⚠️  还有 %d 处【非图片】URL 仍含旧门禁码 %s（官网 / apkUrl /' % (leftover, inferred))
            print('   buttonUrl / links 地址等），本工具不改这些，请按 HANDOVER §5d 单独替换，')
            print('   否则迁移后「一键安装」、快捷方式等按钮仍指向旧链接。')
    else:
        print('未新增图片，无需部署；如需同步内容，把 content.json 覆盖到 GitHub 即可。')

    return 0


if __name__ == '__main__':
    sys.exit(main())
