# Abertura de playlists e controles de coleção

Android 1.1.43 (45), desktop 1.2.46.

- Playlists visitadas mantêm um snapshot em memória, separado por conta; as já conhecidas entram com conteúdo e controles disponíveis enquanto a atualização ocorre em segundo plano.
- Hidratação usa o índice de downloads sem varrer arquivos. Validações completas compartilham uma única operação, são reutilizadas por 30 segundos e cedem a execução entre lotes de oito músicas para não bloquear os toques.
- Mix diário mantém a ordem da seleção e não reaproveita o snapshot de um dia anterior.
- Conteúdo desktop sem teto de 1500 px: margens pequenas em telas largas, sem corredor vazio centralizado.
- Botão da coleção em reprodução mostra pausa e alterna pausa/retomada da fila local sem reiniciá-la; o contexto da reprodução remota também é considerado para indicar a playlist ativa.
- Layout renderizado pelo Electron em viewports de 1280, 1920 e 2560 px, sem overflow horizontal. Testes de cache, validação compartilhada e controles por contexto.
