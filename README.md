# 中药饮片工作台 · 云端同步服务端

把「纯本地」的工作台升级为**云端互通**：电脑和手机连同一个服务端，数据实时同步。
零依赖，仅需 Node ≥ 18，或任意支持 Docker 的环境。

> 配套前端（`public/index.html`）已内置云同步模块，部署后一个网址即可同时提供 **App + 同步 API**。

---

## 一、拿到代码
把本目录（`sync-server/`）下载到你的电脑，或推送到你自己的 GitHub 仓库（用于 Render / Railway 一键部署）。

## 二、配置（所有方式通用）
服务端靠一个**共享密钥**保护数据，务必改成你自己的强密钥：

- 环境变量 `ACCESS_KEY` —— App 端「云同步设置」里要填**完全一样**的值。
- 环境变量 `PORT`（默认 3000）、`DATA_FILE`（数据落盘文件，默认 `./data/db.json`）。
- 前端放 `public/` 后，访问服务端根路径即是工作台；也可把前端托管到别处，在 App 里填服务端地址即可。

## 三、部署方式（任选其一）

### 方式 A：本地 / 自有服务器（Node）
```bash
cd sync-server
ACCESS_KEY=你的强密钥 PORT=3000 node server.js
# 或：把 .env.example 复制为 .env 并填好，然后 node server.js
```
浏览器打开 `http://localhost:3000` 即为工作台。
放到公网：用 Nginx/Caddy 反代此端口并配 HTTPS，或用 `cloudflared` / `ngrok` 临时暴露。

### 方式 B：Docker / docker-compose（NAS、VPS）
```bash
cd sync-server
# 改 docker-compose.yml 里的 ACCESS_KEY
docker compose up -d        # 访问 http://<机器IP>:3000
```
数据持久化在 `./data` 卷，重启用不丢。

### 方式 C：Render 一键部署（免费层）
1. 把本目录推到你的 GitHub 仓库。
2. Render 控制台 → New → Blueprint → 选择该仓库（`render.yaml` 会自动识别）。
3. 在环境变量里把 `ACCESS_KEY` 改成你的强密钥。
4. 部署完成得到 `https://<你的服务>.onrender.com`。
> 免费层会闲置休眠，首次访问有数秒冷启动，属正常。

### 方式 D：Railway
1. 把本目录推到 GitHub，Railway 连仓库（已含 `railway.json`）。
2. 在 Railway 变量里设置 `ACCESS_KEY`。
3. 部署后得到一个 `*.railway.app` 域名。

## 四、在 App 里开启同步（电脑 + 手机都做）
打开工作台 → 左侧「数据 导入/导出」→ **☁ 云端同步设置**：
1. 勾选「启用云端同步」。
2. 服务端地址：
   - 若前端与服务端是**同一网址**（方式 A/B/C/D 部署了 public/）→ 留空。
   - 若前端托管在别处 → 填服务端地址，如 `https://xxx.onrender.com`。
3. 访问密钥：填与 `ACCESS_KEY` **完全一致**的值。
4. 同步模式：自动（改动即传）/ 手动（点右上角同步按钮才传）。
5. 点「保存同步设置」或「测试连接」。

电脑和手机用**同一地址 + 同一密钥** → 共享同一份数据，两端互通。

## 五、接口说明（如需自建前端）
| 方法 | 路径 | 说明 |
|------|------|------|
| GET  | `/api/health` | 健康检查 |
| GET  | `/api/db?key=...` | 拉取 `{rev,data,updatedAt}` |
| PUT  | `/api/db`（body `{data,rev}` + 头 `x-access-key`） | 推送；`rev` 不一致返回 409（冲突） |

基于 `rev` 的乐观锁：冲突时采用「以最新一次编辑为准」的策略自动重试，适合单人双端办公。

## 六、注意事项
- **务必修改默认密钥**：默认 `change-me-please` 仅为占位。
- **数据安全**：数据存于服务端单个 JSON 文件，建议定期在 App 内「导出全部数据」做备份；多人共用同一密钥即共享数据。
- **免费主机休眠**：Render 免费层会休眠，属正常；付费层或自有服务器可常驻。
- 当前为单用户单库设计；如需多账号隔离可在此基础上扩展。
