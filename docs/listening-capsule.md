# Cápsula sonora mensal

Disponível no perfil do Android e no botão de estatísticas da barra superior do desktop.

- `GET /api/listening-stats?month=YYYY-MM`: resumo privado do usuário autenticado; sem parâmetro, retorna o mês atual.
- `POST /api/listening-stats`: registra pequenos intervalos de reprodução com `eventId` e `sessionId` UUID, `sourceId`, `seconds` (1–60) e `occurredAt` em milissegundos.
- O backend usa o calendário de `America/Sao_Paulo`. Rankings são ordenados pelo tempo ouvido, não por cliques no play.
- O primeiro artista creditado é usado no ranking de artistas. Quando a música tem vários gêneros, o intervalo é dividido entre eles. Músicas ainda não classificadas aparecem como “Ainda sem gênero”.
- IDs de evento tornam os reenvios idempotentes. Os clientes guardam intervalos pendentes localmente e tentam enviar novamente. Apenas o aparelho que reproduz áudio registra tempo, não os controles remotos do Connect.
- Pausas e saltos na posição não contam como escuta. O último intervalo parcial pode se perder se o sistema encerrar o processo abruptamente.
- O histórico mensal começa com Android 1.1.36 e desktop 1.2.40. Totais antigos não permitem reconstrução confiável de meses anteriores.
- No Android, ao abrir/retomar o aplicativo, há um aviso local único para o mês anterior se ele tiver escutas. Isso não é um push enviado pelo servidor com o aplicativo fechado.

Os dados persistem na tabela `listening_events`, com índice por usuário/data. Não se deve publicar eventos individuais nem respostas autenticadas em repositórios ou logs públicos.

Validação: `ListeningStatsServiceTests` verifica limites mensais, totais, divisão por gêneros, reenvio e rejeição de intervalos excessivos.
