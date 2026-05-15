# Deploy Skill

## 部署方式

推送代码到 `main` 分支后，GitHub Actions 自动构建并部署到服务器。

- **服务器**: 8.134.18.9 (阿里云 ECS, cn-guangzhou)
- **目标路径**: /var/www/teao-platform/
- **域名**: https://teao.work/
- **Workflow**: `.github/workflows/deploy.yml`

## 工作流程

1. `git push origin main` 触发 GitHub Actions
2. CI 执行 `npm ci` → `npm run build`
3. 通过 rsync (ssh-deploy@v5.1.1) 同步 `dist/` 到服务器
4. Nginx 直接对外提供静态文件

## 部署后检查

```bash
# 检查 GitHub Actions 状态
gh run list --limit 3

# 检查网站是否可访问
curl -s -o /dev/null -w "%{http_code}" https://teao.work/
```

## 手动部署（备用）

如果 GitHub Actions 不可用，可直接用 rsync 部署：

```bash
npm run build
rsync -rlgoDzvc -i --delete -e "ssh" dist/ root@8.134.18.9:/var/www/teao-platform/
```

## Skill 执行步骤

当用户说"部署"或"deploy"时：

1. 检查本地是否有未提交改动
2. 如有改动，先 commit 再 push
3. 如无改动且需要强制部署，触发空提交: `git commit --allow-empty -m "trigger deploy" && git push`
4. 等待 GitHub Actions 完成
5. 确认部署成功后告知用户
