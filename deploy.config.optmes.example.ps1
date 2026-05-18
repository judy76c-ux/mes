# Copy this file to deploy.config.ps1 and change User to the Ubuntu SSH account.

$DeployConfig = @{
    Host = "192.168.10.2"
    User = "mes"
    Port = 22

    WebRoot = "/opt/mes"
    AppRoot = "/opt/mes"

    RestartCommand = "pm2 restart mes-api"

    BackupRoot = "/home/mes/mes-deploy-backups"
    KeyPath = "$env:USERPROFILE\.ssh\id_ed25519"

    # Keep only the newest deploy backups. Set 0 to disable cleanup.
    KeepDeployBackups = 10
}
