# Copy this file to deploy.config.ps1 and edit the values for the Ubuntu MES server.

$DeployConfig = @{
    Host = "192.168.10.2"
    User = "mes"
    Port = 22

    # Remote path that contains index.html, js, css, modules, etc.
    WebRoot = "/var/www/mes"

    # Remote path that contains api-server/server.js and api-server/package.json.
    AppRoot = "/var/www/mes"

    # Command used after api-server files are copied.
    # Examples:
    #   "sudo systemctl restart mes-api"
    #   "pm2 restart mes-api"
    #   "cd /var/www/mes/api-server && nohup node server.js > mes-api.log 2>&1 &"
    RestartCommand = "sudo systemctl restart mes-api"

    # Remote directory where rollback copies are kept.
    BackupRoot = "/home/mes/mes-deploy-backups"
}
