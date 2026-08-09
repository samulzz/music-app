# Implantação de teste do NationMusics

Implantação ativa em `/opt/nationmusics-test` no servidor de testes.

- API pública: `https://marlonbarbershop.com/nationmusics/api`
- APK: `https://marlonbarbershop.com/nationmusics/download/nationmusics.apk`
- Container: `nationmusics-test-api`
- Gerador de PO Token: `nationmusics-test-pot-provider`
- Porta local: `127.0.0.1:8090`
- Limite de memória: 640 MiB
- Limite de CPU: 1 núcleo
- Banco: `nationmusics_test`, separado dentro do MySQL existente
- Volume de áudio: `nationmusics-test-downloads`

O site de barbearia continua nos containers originais. O Nginx apenas inclui o snippet `nationmusics-test.conf` dentro do virtual host HTTPS existente.

## Atualizar a API

Gerar o JAR:

```powershell
cd api-restfull\music-api
mvn -DskipTests package
```

Copiar o JAR para este diretório com o nome `music-api.jar`, enviar os arquivos ao servidor e executar:

```bash
cd /opt/nationmusics-test
docker compose up -d --build
```

Em uma VPS nova que ja possua a barbearia em `/opt/barbershop-site`, execute
primeiro `provision-vps.sh`. Ele cria o banco e o usuario isolados, gera os
segredos diretamente no servidor e valida o Compose sem expor credenciais no
Git.

## Operação

```bash
cd /opt/nationmusics-test
docker compose ps
docker compose logs -f --tail=100
docker stats nationmusics-test-api
```

## Backup externo

O diretorio `backup/` contem o script e o timer para backup diario criptografado
no Google Drive. Ele guarda snapshots do banco/configuracao e sincroniza o
acervo de forma incremental, sem reenviar os MP3 ja preservados. Consulte
`backup/README.md` para a primeira autorizacao OAuth e ativacao do timer.

## Acesso ao YouTube

O deploy usa o `yt-dlp` nightly com o provedor `bgutil` recomendado pela documentação do projeto. O container `pot-provider` gera PO Tokens automaticamente para cada vídeo, então não há arquivo de cookies para renovar no funcionamento normal.

Cookies continuam opcionais via `YOUTUBE_COOKIES_PATH` apenas para conteúdo que exige uma conta (privado, restrito por idade ou exclusivo para membros). O app não depende deles para músicas públicas.

As chamadas ao YouTube são serializadas e espaçadas por 10 segundos para evitar o bloqueio temporário do IP da VPS. O intervalo pode ser alterado por `YOUTUBE_MIN_REQUEST_INTERVAL_SECONDS`. Se for necessário trocar o IP de saída sem alterar o aplicativo, configure um proxy em `YOUTUBE_PROXY`.

Para confirmar que o plugin foi carregado:

```bash
docker compose exec api yt-dlp -v "https://www.youtube.com/watch?v=dQw4w9WgXcQ"
```

O log deve listar um provedor `bgutil:http`.
