# Offline, buscas recentes e importação pessoal

Android 1.1.39 e desktop 1.2.43.

- A restauração fria no Android verifica conectividade e arquivos locais antes de entregar a fila ao player. Sem rede, não restaura uma faixa remota nem inicia ciclos de recuperação. Estatísticas toleram inicialização do player. A tela de atualização libera o conteúdo caso a consulta falhe.
- Adicionar à playlist também salva a música na biblioteca da conta, sem exigir uma ação anterior. O desktop usa um seletor HTML em vez de `prompt`, indisponível em alguns contextos Electron. Android oferece a opção na busca, player e seleção de músicas.
- `/search/recent` é um histórico pessoal de até 20 músicas abertas pela busca, não de todas as faixas retornadas por uma consulta. A lista sincroniza ao entrar na busca e tem cache local. Isso não transfere arquivos de áudio entre dispositivos.
- `/spotify/import` exige autenticação, lê uma playlist pública, associa áudio existente por título e artista normalizados conservadoramente e guarda faixas ausentes separadamente. Reimportar o mesmo link na mesma conta atualiza a playlist em vez de duplicá-la. Links incompletos ou acima de 1000 faixas não criam uma playlist parcial.
- Pendências não têm URLs reproduzíveis. Prioridades são deduplicadas pelo ID externo e ficam acima das prioridades de álbuns. Um job de dois minutos percorre até dez playlists pendentes por ciclo e associa músicas assim que o áudio fica disponível.
- O importador consulta `/admin/import-priorities` com sessão administrativa, sem abrir o endpoint público nem colocar credenciais no frontend.

Validação: testes do backend e desktop, TypeScript e builds de produção. A conferência visual usa dados de demonstração. Nenhum Android estava conectado para reproduzir e validar um crash nativo; se houver fechamento do processo após esta versão, será necessário capturar o log do aparelho.
