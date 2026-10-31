#!/usr/bin/env python3
"""
生成两份描红楷体子集：

- public/fonts/wenkai-subset.woff2：内置字库 JSON 里出现的字符，约 12KB，启动即加载
- public/fonts/wenkai-common.woff2：GB2312 一级常用字（3755 个），约 2MB，
  供「自定义描红内容」按需加载

用法：
    pip3 install fonttools brotli
    mkdir -p .font-src && cd .font-src
    npm pack lxgw-wenkai-webfont@1.7.0 && tar -xzf lxgw-wenkai-webfont-*.tgz
    cd .. && python3 scripts/build-font.py

为什么走 npm 而不是官方 GitHub Release：
    Release 直链（objects.githubusercontent.com）在部分网络下会返回
    HTTP/2 framing error 或空响应，npm registry 更稳定。

为什么先合并再子集：
    webfont 包把字体按 unicode-range 拆成 97 个 woff2 分片，
    内置字库的 110 个字符散落在其中 14 片里。直接引用 14 个分片要 653KB，
    合并后只保留用到的字形，体积降到 12KB 左右。

改字库 JSON 之后必须重跑本脚本，否则新字会渲染成回退字体。
自定义描红依赖常用字子集，脚本没有跑过时自定义字会退到系统字体。
"""

import json
import pathlib
import re
import string
import sys

try:
    from fontTools.merge import Merger
    from fontTools.subset import Options, Subsetter
    from fontTools.ttLib import TTFont
except ImportError:
    sys.exit('缺少依赖：pip3 install fonttools brotli')

ROOT = pathlib.Path(__file__).resolve().parent.parent
SOURCE_DIR = ROOT / '.font-src' / 'package'
CSS = SOURCE_DIR / 'lxgwwenkai-regular.css'
BASE_OUTPUT = ROOT / 'public' / 'fonts' / 'wenkai-subset.woff2'
COMMON_OUTPUT = ROOT / 'public' / 'fonts' / 'wenkai-common.woff2'
MERGED_TTF = ROOT / '.font-src' / '_merged.ttf'


def unique(text: str) -> str:
    """按出现顺序去重"""
    return ''.join(dict.fromkeys(text))


def collect_chars() -> str:
    chars: list[str] = []
    seen: set[str] = set()
    for file in sorted((ROOT / 'src' / 'lib' / 'copybooks').glob('*.json')):
        data = json.loads(file.read_text(encoding='utf-8'))
        for char in data.get('chars', []):
            if char not in seen:
                seen.add(char)
                chars.append(char)
    return ''.join(chars)


def gb2312_level1() -> str:
    """GB2312 一级汉字（16–55 区，3755 字），足够覆盖小学习字范围"""
    chars: list[str] = []
    for high in range(0xB0, 0xD8):
        for low in range(0xA1, 0xFF):
            try:
                chars.append(bytes((high, low)).decode('gb2312'))
            except UnicodeDecodeError:
                continue
    return ''.join(chars)


def base_text() -> str:
    return unique(collect_chars())


def common_text() -> str:
    # 字母数字留给「楷体加载失败后仍能显示拼音」的兜底；〇 是年级常用字
    extras = string.ascii_letters + string.digits + '〇'
    return unique(collect_chars() + gb2312_level1() + extras)


def parse_faces(css_text: str):
    faces = []
    for block in re.findall(r'@font-face\s*{(.*?)}', css_text, re.S):
        url = re.search(r"url\('\./files/([^']+)'\)", block)
        ranges = re.search(r'unicode-range:\s*([^;}]+)', block)
        if not url or not ranges:
            continue
        pairs = []
        for part in ranges.group(1).split(','):
            part = part.strip().upper().replace('U+', '')
            if not part:
                continue
            if '-' in part:
                low, high = part.split('-')
                pairs.append((int(low, 16), int(high, 16)))
            else:
                value = int(part, 16)
                pairs.append((value, value))
        faces.append((url.group(1), pairs))
    return faces


def pick_faces(text: str, faces) -> list[str]:
    """返回覆盖 text 所需的分片，并检查字体里是否缺字"""
    needed: dict[str, None] = {}
    missing: list[str] = []

    for char in text:
        code = ord(char)
        hit = None
        for name, pairs in faces:
            if any(low <= code <= high for low, high in pairs):
                hit = name
                break
        if hit is None:
            missing.append(char)
        else:
            needed[hit] = None

    if missing:
        sys.exit(f'字体里没有这些字符：{"".join(missing)}')

    return sorted(needed)


def build_subset(source: pathlib.Path, text: str, output: pathlib.Path) -> None:
    font = TTFont(str(source))

    options = Options()
    options.layout_features = ['*']
    options.name_IDs = ['*']
    options.notdef_outline = True
    options.recalc_bounds = True
    options.drop_tables += ['DSIG', 'BASE', 'JSTF', 'VDMX', 'hdmx', 'LTSH']

    subsetter = Subsetter(options=options)
    subsetter.populate(text=text)
    subsetter.subset(font)

    font.flavor = 'woff2'
    output.parent.mkdir(parents=True, exist_ok=True)
    font.save(str(output))

    check = TTFont(str(output))
    cmap = check.getBestCmap()
    absent = [char for char in text if ord(char) not in cmap]

    print(f'输出 {output.relative_to(ROOT)}：{output.stat().st_size / 1024:.1f} KB')
    print(f'  字符 {len(text)} 个，字形覆盖 {len(cmap)} 个，缺失 {len(absent)} 个')
    if absent:
        sys.exit(f'  子集后仍缺字符：{"".join(absent)}')


def main() -> None:
    if not CSS.exists():
        sys.exit(f'找不到字体源：{CSS}\n请先按脚本顶部说明下载 lxgw-wenkai-webfont 到 .font-src/')

    base = base_text()
    common = common_text()
    if not base:
        sys.exit('字库为空，检查 src/lib/copybooks/*.json')

    faces = parse_faces(CSS.read_text(encoding='utf-8'))
    paths = [str(SOURCE_DIR / 'files' / name) for name in pick_faces(unique(base + common), faces)]
    print(f'内置字 {len(base)} 个，常用字子集 {len(common)} 个，命中 {len(paths)} 个分片')

    # 两份子集来自同一次合并，避免重复加载 97 个分片
    merged = Merger().merge(paths)
    merged.save(str(MERGED_TTF))

    build_subset(MERGED_TTF, base, BASE_OUTPUT)
    build_subset(MERGED_TTF, common, COMMON_OUTPUT)
    MERGED_TTF.unlink(missing_ok=True)


if __name__ == '__main__':
    main()
