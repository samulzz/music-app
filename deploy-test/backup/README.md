# Backup automatico no Google Drive

O backup salva um dump consistente do MySQL, os arquivos de configuracao do
deploy e uma copia incremental do volume de audios. O destino deve ser um
remote `crypt` do rclone; assim, nomes e conteudo ficam criptografados antes de
sair da VPS.

## Configuracao inicial na VPS

1. Instale o rclone e execute `rclone config`.
2. Crie um remote Google Drive autenticado com `kaylonsilvajunior@gmail.com`.
3. Crie um segundo remote do tipo `crypt` apontando para uma pasta do primeiro.
4. Copie `backup.env.example` para `backup/.env`, preencha os dados e execute
   `chmod 600 backup/.env`.
5. Teste com `sudo backup/backup.sh` e valide os arquivos no Drive.
6. Ative a agenda:

```bash
sudo chmod +x /opt/nationmusics-test/backup/backup.sh
sudo cp /opt/nationmusics-test/backup/nationmusics-backup.service /etc/systemd/system/
sudo cp /opt/nationmusics-test/backup/nationmusics-backup.timer /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable --now nationmusics-backup.timer
sudo systemctl list-timers nationmusics-backup.timer
```

O dump e as configuracoes recebem um snapshot por execucao. Os audios usam
`rclone copy --ignore-existing`, portanto uma madrugada nao reenvia todo o
acervo e arquivos apagados por engano na VPS nao sao apagados do Drive.
