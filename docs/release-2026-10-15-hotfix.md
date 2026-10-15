# Correção de navegação Android e pesquisas recentes

Android 1.1.42 (44), desktop 1.2.45.

- Retiradas as transições de navegação do Android para eliminar a regressão de piscadas/lentidão. A lista de busca não usa recorte nativo de subviews ao alternar telas.
- Pesquisas recentes persistidas imediatamente por conta; falhas de registro ficam pendentes para reenvio. Respostas vazias ou atrasadas não apagam seleções locais novas.
- Requisições mantêm o token da conta que iniciou a operação, inclusive durante troca de usuário. Respostas antigas não encerram a sessão de outra conta.
- Caches legados não confiáveis são ignorados; o histórico persistido no servidor permanece intacto e é a origem inicial da nova cache por conta.
- As recentes registram as músicas explicitamente abertas nos resultados da busca, não a reprodução automática de playlists ou recomendações.
- Testes de isolamento entre contas, persistência offline, retorno vazio concorrente e navegação sem animações.
