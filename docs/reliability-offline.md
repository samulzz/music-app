# Player, catálogo e offline — Android 1.1.37 / desktop 1.2.41

## Player

- O desktop usa primeiro o áudio local validado, sem consultar a VPS quando ele já existe.
- Continua pré-carregando as próximas duas faixas. Há uma tentativa limitada de recuperação para buffering prolongado, preservando a posição.
- Recuperações e seleções assíncronas conferem a revisão da fila antes de reaplicar dados. Trocar de música ou pausar invalida tentativas antigas.
- O Android não apaga downloads explícitos por um erro transitório. Offline, a recuperação permanece no arquivo local.
- Os gêneros são preservados na normalização do desktop, para manter a afinidade das recomendações.

## Catálogo

- Busca, artistas e álbuns colapsam metadados repetidos; versões ao vivo, remix e acústicas permanecem distintas.
- A cada dez minutos, duas playlists globais são verificadas e suas referências repetidas consolidadas, preferindo um arquivo disponível. Não há exclusão de arquivos, IDs, playlists pessoais ou histórico.
- A identificação de álbuns exige correspondência de título/versão e artista, sem escolher um artista diferente apenas porque ele aparece na busca.
- Duração de referência é armazenada quando há metadados confiáveis. A auditoria existente sinaliza divergências no painel e cria prioridade para revisão no importador. Isso não substitui identificação acústica nem garante detectar toda gravação incorreta.
- O importador verifica a duração real do MP3 com ffprobe antes de aceitar um download.

## Offline

- Há uma seção “Baixadas neste celular/computador” na Biblioteca.
- Metadados de biblioteca e playlists já consultadas são persistidos por conta e usados quando a rede falha. Não se mascara uma resposta 401/403 com cache.
- No Android, a fila offline inclui somente faixas com arquivo local disponível.
- Downloads explícitos do desktop são protegidos da limpeza/limite do cache automático. Remover da seleção offline deixa o arquivo no cache, permitindo sua reutilização e respeitando outras contas que o tenham baixado.
- Desktop e serviço Android conservam transferências interrompidas. Quando o servidor fornece ETag ou Last-Modified, a próxima tentativa usa Range + If-Range. Sem validador, o download reinicia para não misturar versões de um arquivo.
- Arquivos parciais nunca são publicados como áudio concluído.

O primeiro acesso a uma playlist ainda exige internet. Não se faz login ou cria conta sem rede. No desktop, a seção Baixadas é a seleção garantida para ouvir sem internet; listas parcialmente baixadas podem conter faixas indisponíveis.

Testes: CatalogIdentityTests; node --test desktop-app/test/resumable-download.test.cjs; typecheck do Android e build Kotlin/Gradle.
