# MES Deployment

This project is edited on the development PC and deployed to the Ubuntu MES server.

## 1. Create deploy config

Copy the example config:

```powershell
Copy-Item deploy.config.example.ps1 deploy.config.ps1
```

Edit `deploy.config.ps1`.

Required values:

- `Host`: Ubuntu server IP, usually `192.168.10.2`
- `User`: SSH login user
- `WebRoot`: Ubuntu directory served by `http://192.168.10.2/`
- `AppRoot`: Ubuntu directory that contains `api-server`
- `RestartCommand`: API restart command

## 2. Find Ubuntu paths

Run these commands on the Ubuntu server if the MES path is unknown:

```bash
sudo ss -ltnp | grep :3000
ps aux | grep node
sudo find / -name index.html 2>/dev/null | grep -i -E "mes|www|html|생산"
sudo find / -name server.js 2>/dev/null | grep api-server
```

Common web roots:

```text
/var/www/html
/var/www/mes
/home/mes/production-mes
/opt/mes
```

If Apache uses `/opt/mes`, use:

```powershell
Copy-Item deploy.config.optmes.example.ps1 deploy.config.ps1
```

Then edit only `User` and `BackupRoot` if needed.

## API server with systemd

If port `3000` is not running, install the API server as a systemd service on Ubuntu.

Copy `ubuntu/mes-api.service.example` to the server:

```bash
sudo cp /opt/mes/ubuntu/mes-api.service.example /etc/systemd/system/mes-api.service
sudo systemctl daemon-reload
cd /opt/mes/api-server
npm install
sudo systemctl enable --now mes-api
sudo systemctl status mes-api
```

Check:

```bash
curl http://127.0.0.1:3000/health
curl http://127.0.0.1:3000/api/backups
```

## 3. Test package creation only

```powershell
.\deploy.ps1 -DryRun
```

## 4. Set up passwordless SSH

Password-based SSH asks once per SSH/SCP connection. To avoid repeated password prompts, install a key once:

```powershell
.\setup-ssh-key.ps1
```

This asks for the Ubuntu password once, then future deploys should not ask for it.

## 5. Deploy

```powershell
.\deploy.ps1
```

The script uploads:

- `index.html`
- `404.html`
- `css`
- `js`
- `modules`
- `api-server/server.js`
- `api-server/package.json`
- `api-server/Dockerfile`

Before overwriting remote files, it saves rollback copies under `BackupRoot`.

## 6. Deploy without API restart

```powershell
.\deploy.ps1 -SkipRestart
```

Use this when only frontend files changed or when you want to restart the API manually.
