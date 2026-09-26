#!/bin/bash

# ============================================
# Teao Platform — 一键启动开发环境
# 同时启动后端 (Express) 和前端 (Vite)
# ============================================

set -e

PROJECT_DIR="$(cd "$(dirname "$0")" && pwd)"

# 本项目的原生依赖按 Node.js 24 编译。若系统默认 Node 不是 24，
# 自动在临时的 Node.js 24 环境中重新执行，避免后端启动后立即退出。
NODE_MAJOR=$(node -p "process.versions.node.split('.')[0]" 2>/dev/null || true)
if [ "$NODE_MAJOR" != "24" ]; then
  echo "检测到 Node.js $(node --version 2>/dev/null || echo '未知')，正在切换到 Node.js 24..."
  exec npx -y -p node@24 -c "bash \"$PROJECT_DIR/start-dev.sh\""
fi

# 颜色输出
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
NC='\033[0m' # No Color

cleanup() {
  EXIT_CODE="${1:-$?}"
  trap - EXIT SIGINT SIGTERM
  echo ""
  echo -e "${YELLOW}🛑 正在停止所有服务...${NC}"
  if [ -n "$BACKEND_PID" ] && kill -0 "$BACKEND_PID" 2>/dev/null; then
    kill "$BACKEND_PID" 2>/dev/null
    echo -e "${GREEN}✅ 后端已停止${NC}"
  fi
  if [ -n "$FRONTEND_PID" ] && kill -0 "$FRONTEND_PID" 2>/dev/null; then
    kill "$FRONTEND_PID" 2>/dev/null
    echo -e "${GREEN}✅ 前端已停止${NC}"
  fi
  echo -e "${GREEN}👋 开发环境已关闭${NC}"
  exit "$EXIT_CODE"
}

# 捕获退出信号
trap 'cleanup 130' SIGINT
trap 'cleanup 143' SIGTERM
trap 'cleanup $?' EXIT

echo -e "${CYAN}============================================${NC}"
echo -e "${CYAN}  🚀 Teao Platform 开发环境启动中...${NC}"
echo -e "${CYAN}============================================${NC}"
echo ""

# 检查 .env 文件
ENV_FILE="$PROJECT_DIR/.env"
if [ ! -f "$ENV_FILE" ]; then
  echo -e "${RED}❌ 未找到 .env 文件，请先创建: cp .env.example .env${NC}"
  exit 1
fi
# 检查 JWT_SECRET；开发环境允许示例值，但会明确告警
JWT_VALUE=$(grep "^JWT_SECRET=" "$ENV_FILE" | head -1 | cut -d'=' -f2-)
if [ -z "$JWT_VALUE" ]; then
  echo -e "${RED}❌ .env 中 JWT_SECRET 未配置${NC}"
  exit 1
fi
if [ ${#JWT_VALUE} -lt 32 ] || [[ "$JWT_VALUE" =~ ^(change-me|your[-_[:space:]]?secret|replace-me) ]]; then
  echo -e "${YELLOW}⚠️  JWT_SECRET: 正在使用开发占位值，生产环境必须替换${NC}"
else
  echo -e "${GREEN}  JWT_SECRET: 已配置${NC}"
fi

# 启动后端
echo -e "${YELLOW}📦 启动后端 (Express :3899)...${NC}"
cd "$PROJECT_DIR/server"
NODE_ENV=development node --env-file="$ENV_FILE" server.js &
BACKEND_PID=$!
echo -e "${GREEN}  后端 PID: $BACKEND_PID${NC}"

# 启动前端
echo -e "${YELLOW}🎨 启动前端 (Vite)...${NC}"
cd "$PROJECT_DIR"
"$PROJECT_DIR/node_modules/.bin/vite" --host &
FRONTEND_PID=$!
echo -e "${GREEN}  前端 PID: $FRONTEND_PID${NC}"

echo ""
echo -e "${CYAN}============================================${NC}"
echo -e "${GREEN}✅ 所有服务已启动！${NC}"
echo -e "${CYAN}  前端: http://localhost:5173${NC}"
echo -e "${CYAN}  后端: http://127.0.0.1:3899${NC}"
echo -e "${YELLOW}  按 Ctrl+C 停止所有服务${NC}"
echo -e "${CYAN}============================================${NC}"
echo ""

# 监控两个服务。任一服务异常退出时同时关闭另一服务，避免出现
# “前端仍可访问，但所有 API 请求都失败”的假启动状态。
while kill -0 "$BACKEND_PID" 2>/dev/null && kill -0 "$FRONTEND_PID" 2>/dev/null; do
  sleep 1
done

if ! kill -0 "$BACKEND_PID" 2>/dev/null; then
  echo -e "${RED}❌ 后端服务已退出，请查看上方错误日志${NC}"
else
  echo -e "${RED}❌ 前端服务已退出，请查看上方错误日志${NC}"
fi

exit 1
