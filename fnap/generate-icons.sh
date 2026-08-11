#!/bin/bash
# 从项目根目录的 images/logo.png 生成飞牛应用所需的各尺寸图标
# 依赖: ImageMagick (convert)
# 用法: bash fnap/generate-icons.sh

set -e

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
SOURCE_LOGO="$PROJECT_ROOT/images/logo.png"

if [ ! -f "$SOURCE_LOGO" ]; then
  echo "错误: 找不到源图标 $SOURCE_LOGO" >&2
  exit 1
fi

if ! command -v convert >/dev/null 2>&1; then
  echo "错误: 需要 ImageMagick (convert 命令)" >&2
  exit 1
fi

# 飞牛要求的图标文件
declare -a ICONS=(
  "ICON.PNG:512"
  "ICON_256.PNG:256"
  "app/ui/images/icon_64.png:64"
  "app/ui/images/icon_256.png:256"
)

for entry in "${ICONS[@]}"; do
  REL_PATH="${entry%%:*}"
  SIZE="${entry##*:}"
  TARGET="$SCRIPT_DIR/$REL_PATH"
  mkdir -p "$(dirname "$TARGET")"
  convert "$SOURCE_LOGO" -resize "${SIZE}x${SIZE}" "$TARGET"
  echo "生成: $REL_PATH (${SIZE}x${SIZE})"
done

echo "图标生成完成"
