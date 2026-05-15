# Deploy Skill

## 部署方式

推送代码到 `main` 分支后，GitHub Actions 自动构建并部署到服务器。

- **服务器**: 8.134.18.9 (阿里云 ECS, cn-guangzhou)
- **目标路径**: /var/www/teao-platform/
- **域名**: https://teao.work/
- **API**: Express on port 3899, proxied via nginx `/api/*`
- **Workflow**: `.github/workflows/deploy.yml`

## 触发方式

**手动触发**（推荐）：

```bash
gh workflow run "Deploy to Server" --ref main
```

## 工作流程

1. 手动触发后 GitHub Actions 开始执行
2. CI 执行 `npm ci` → `npm run build`
3. rsync `dist/` → `/var/www/teao-platform/`
4. rsync `server/` → `/var/www/teao-platform/server/`
5. Remote: `npm install` → `systemctl restart teao-api`
6. Nginx 静态文件 + API 反向代理

## 部署后检查

```bash
# 检查 GitHub Actions 状态
gh run list --limit 3

# 检查网站是否可访问
curl -s -o /dev/null -w "%{http_code}" https://teao.work/

# 检查 API 是否正常
curl -s https://teao.work/api/history -H "X-Auth-Password: teao123"
```

## 手动 rsync 部署（备用）

```bash
npm run build
rsync -rlgoDzvc -i --delete -e "ssh" dist/ root@8.134.18.9:/var/www/teao-platform/
rsync -rlgoDzvc -i -e "ssh" server/ root@8.134.18.9:/var/www/teao-platform/server/
ssh root@8.134.18.9 "cd /var/www/teao-platform/server && npm install --production && systemctl restart teao-api"
```

## Skill 执行步骤

当用户说"部署"或"deploy"时：

1. 检查本地是否有未提交改动，如有则 commit + push
2. 触发手动部署: `gh workflow run "Deploy to Server" --ref main`
3. 等待 GitHub Actions 完成
4. 确认部署成功后告知用户
