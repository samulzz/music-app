# Importador local para a VPS

Interface local para pre-baixar musicas pelo seu computador, enviar os MP3 para a VPS e colocar as musicas em playlist pessoal, playlist global, ou apenas no catalogo da pesquisa.

## Como rodar

```powershell
cd D:\dev\music-app
python -m pip install --user -r tools\local-vps-importer\requirements.txt
python tools\local-vps-importer\app.py
```

Abra:

```text
http://127.0.0.1:8765
```

O painel abre primeiro no modo automatico. Nesse modo, nao e necessario copiar
nenhum link: use a chave SSH recomendada (ou informe a senha, se a VPS aceitar)
e clique em `Iniciar automatico`. O processo fica ativo 24/7, verifica as fontes
em ciclos, baixa lotes pequenos e nao possui limite total de musicas. O painel
mostra cada musica encontrada, baixada e enviada. O botao `Parar` espera o lote
atual terminar para nao interromper um upload pela metade.

O importador manual antigo continua disponivel em `Importar um link
manualmente`, na parte inferior do painel.

## O que ela faz

- Le playlist, album ou musica do Spotify.
- Busca e baixa os audios pelo YouTube usando o `yt-dlp` local.
- Usa Node para resolver o desafio JS do YouTube.
- Usa o provedor de PO Token da VPS apenas para gerar token; o download do audio continua saindo do seu PC.
- Envia os MP3 para o volume `nationmusics-test-downloads` da VPS.
- Cria o usuario se ele ainda nao existir, quando a playlist pessoal estiver marcada.
- Salva as musicas na biblioteca do usuario, quando a playlist pessoal estiver marcada.
- Cria ou atualiza uma playlist pessoal com essas musicas, se marcada.
- Cria ou atualiza uma playlist global da aba principal, se marcada.
- Se nenhuma playlist estiver marcada, apenas adiciona as musicas ao catalogo da pesquisa.

## Só playlist global

Na interface:

1. Desmarque `Criar/atualizar playlist pessoal do usuario`.
2. Marque `Criar/atualizar playlist global na aba principal`.
3. Preencha VPS, senha SSH e link do Spotify. Usuario/senha do app nao sao necessarios.

Pelo terminal:

```powershell
python tools\local-vps-importer\app.py --once --no-personal-playlist --create-global-playlist --spotify-url "https://open.spotify.com/playlist/..."
```

## Somente catalogo/pesquisa

Use para uma musica unica ou album aparecer na busca normal sem criar playlist.

Na interface:

1. Desmarque `Criar/atualizar playlist pessoal do usuario`.
2. Deixe `Criar/atualizar playlist global na aba principal` desmarcada.
3. Preencha VPS, senha SSH e link de musica/album/playlist do Spotify.

Pelo terminal:

```powershell
python tools\local-vps-importer\app.py --once --no-personal-playlist --spotify-url "https://open.spotify.com/track/..."
```

As senhas nao ficam salvas nesse diretorio. Preencha na tela quando for importar.

## Importacao automatica continua (24/7)

O `nightly.py` consulta playlists brasileiras de destaque, escolhe somente
faixas ainda nao processadas e reaproveita o mesmo download/upload do importador
manual. Ele trabalha uma fonte por vez, em lotes pequenos, e espera alguns
minutos antes do proximo ciclo. O historico fica em SQLite dentro de
`.local-precache`, entao uma faixa concluida hoje nao volta para a fila amanha.
As fontes iniciais cobrem Top Brasil, funk, sertanejo, pagode, trap nacional,
forro e piseiro.

Primeira configuracao:

```powershell
cd D:\dev\music-app
powershell -ExecutionPolicy Bypass -File tools\local-vps-importer\run-nightly.ps1
```

Na primeira chamada o script cria `automation.json` a partir do exemplo. Edite
esse arquivo se quiser trocar o tamanho dos lotes, intervalo ou fontes. Cada fonte aceita playlist,
album ou faixa do Spotify:

```json
{
  "name": "Album novo de um artista importante",
  "url": "https://open.spotify.com/album/ID_DO_ALBUM",
  "publishPlaylist": true,
  "enabled": true
}
```

Use `publishPlaylist: true` apenas nas selecoes relevantes para a pagina
principal. Com `false`, as faixas entram no catalogo e na busca, sem poluir a
home com muitas playlists.

Antes de baixar, simule a selecao:

```powershell
powershell -ExecutionPolicy Bypass -File tools\local-vps-importer\run-nightly.ps1 -DryRun
```

Para iniciar a execucao real:

```powershell
powershell -ExecutionPolicy Bypass -File tools\local-vps-importer\run-nightly.ps1
```

Para rodar sem interacao, configure `sshKeyPath` em `automation.json` ou defina
`NATIONMUSICS_SSH_KEY_PATH`. A chave privada nunca deve entrar no Git. Se a VPS
aceitar senha, tambem e possivel usar `NATIONMUSICS_SSH_PASSWORD`.

Consulte o total concluido, falhas e as ultimas execucoes:

```powershell
powershell -ExecutionPolicy Bypass -File tools\local-vps-importer\run-nightly.ps1 -Status
```

Faixas com erro sao tentadas no maximo cinco vezes (configuravel por
`maxRetries`). A automacao possui trava contra duas execucoes simultaneas e nao
mantem uma fila gigante: descobre no maximo 200 itens por fonte e envia lotes
pequenos, sequencialmente.
