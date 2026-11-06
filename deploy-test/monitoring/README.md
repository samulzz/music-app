# Auditoria da qualidade do catálogo

O painel administrativo exibe a última análise persistida em `audio_quality_reviews`.
O backend examina até 3 músicas por rodada (intervalo de 60 segundos após terminar),
com apenas um FFmpeg ativo por vez, e revisita cada resultado depois de 7 dias.
O botão **Reanalisar** coloca a faixa na frente das verificações automáticas.

## Evidências e limites

- Volume integrado abaixo de **-22 LUFS**: alerta de volume baixo.
- Pico verdadeiro acima de **+1,5 dBTP**: possível sobrecarga; não comprova distorção.
- Mais de **15%** da faixa em silêncio abaixo de **-50 dB** por pelo menos 2 segundos:
  alerta de silêncio excessivo.
- Duração, integridade e bitrate continuam sendo verificados.
- Título e canal originais são consultados pelo oEmbed do YouTube, com timeout curto.
  Show, 8D, instrumental e beat gratuito são **indícios de versão**, não detecção vocal.
- Versões ao vivo/instrumentais explicitamente pedidas pelo título/álbum não devem
  ser tratadas como erro só por conterem esses termos.
- Fonte indisponível ou medição malsucedida aparece como análise parcial/erro, nunca
  como comprovação de qualidade. Fontes remotas sem arquivo local não são medidas.
- Presença de voz cantada **não é analisada por IA**. Não se deduz voz de silêncio,
  frequência, volume ou título. Os níveis de confiança dos indícios são heurísticos,
  não probabilidades calibradas por um modelo.

Nenhuma suspeita apaga, normaliza ou substitui arquivos automaticamente. Um resultado
aprovado significa apenas ausência de alerta nas verificações realizadas.

Resultados antigos são substituídos pela nova análise da mesma música; isso remove
alertas resolvidos. O arquivo original é preservado mesmo se FFmpeg falhar.

As quatro correções manuais de 2026-11-06 preservaram os IDs 1082, 476, 1090 e 478.
Os arquivos anteriores e metadados foram guardados em backup privado na VPS.
Uma cópia offline já baixada em um dispositivo precisa ser baixada novamente.
