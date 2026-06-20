# Migração do player v5

Validação concluída em 20 de junho de 2026.

## Resultado

- Expo SDK 56.0.12, React Native 0.85.3 e React 19.2.3.
- Player migrado para `@rntp/player` 5.5.0.
- Controles nativos de mídia confirmados: reproduzir, pausar, anterior e próxima.
- Reprodução em segundo plano e pela notificação confirmada no Android 16.
- Downloads são salvos como MP3 no armazenamento privado do aplicativo.
- Sessão é persistida com SecureStore e continua válida para abrir o aplicativo offline.
- Biblioteca local é carregada antes da API e continua funcional sem rede.
- Release usa Hermes, Nova Arquitetura, R8 e remoção de recursos não utilizados.

## Teste offline executado

1. Login realizado com internet.
2. Duas músicas baixadas pelo aplicativo.
3. Wi-Fi, dados móveis e interface de rede do emulador desativados.
4. Aplicativo encerrado à força e aberto novamente.
5. Usuário persistido e duas músicas locais exibidas na Biblioteca.
6. Reprodução, pausa, anterior e próxima executadas pela sessão de mídia.
7. Reprodução continuou com o aplicativo em segundo plano.

## Desempenho de referência

Medições feitas em uma release minificada, num emulador Android 16 com 3 GB de RAM. Elas servem como referência de laboratório; aparelhos físicos variam.

| Cenário | Resultado |
| --- | --- |
| Abertura fria final, offline | 1,165 s |
| Memória após abertura | 195.667 KB PSS (aprox. 191 MiB) |
| Memória RSS após abertura | 326.028 KB (aprox. 318 MiB) |
| Pico de CPU durante abertura | 123% no `top` multicore |
| Download de MP3 de teste | 11,4 s para 43.299 bytes |
| CPU durante download | pico de 53,8%; normalmente entre 0% e 8% após iniciar |
| Memória durante download | pico de 250,6 MiB PSS |
| CPU em reprodução no segundo plano | média de 4,8%; pico de 12% |
| Memória durante reprodução/início do player | 253,7 MiB PSS em média; estabiliza abaixo disso após reiniciar |

Busca remota no YouTube é o trecho mais lento do fluxo testado: aproximadamente 15 a 20 segundos. Esse tempo vem principalmente do backend/YouTube, não da interface.

## Builds locais

As APKs ficam em `app-front/nationmusics/dist/` e são ignoradas pelo Git.

| Arquivo | Tamanho | SHA-256 |
| --- | ---: | --- |
| `nationmusics-1.0.0-universal-test.apk` | 87,47 MiB | `5A223C9C033E00CFAC331EC110DFFDF885461B86847070ED9A4FFE11CB4917AF` |
| `nationmusics-1.0.0-arm64-test.apk` | 35,30 MiB | `33041F8F07FF0E154AB177434CCD6BE11BE50718C87CCA1FF0219ECD095B221A` |

Configuração Android: minSdk 24, targetSdk 36 e compileSdk 36.

As APKs atuais usam a chave de depuração e são destinadas a teste interno. Para Play Store, gerar AAB/APK com uma chave de produção ou credenciais do EAS.

## Como repetir a build no Windows

Usar JDK 17:

```powershell
$env:JAVA_HOME='C:\Program Files\Java\jdk-17'
$env:ANDROID_HOME='C:\Users\samue\AppData\Local\Android\Sdk'
$env:ANDROID_SDK_ROOT=$env:ANDROID_HOME
$env:NODE_ENV='production'
cd app-front\nationmusics\android
.\gradlew.bat assembleRelease
```

Para somente ARM64:

```powershell
.\gradlew.bat assembleRelease -PreactNativeArchitectures=arm64-v8a
```

## Observações

- O `expo-doctor` passa 20 de 21 verificações. O único aviso informa que o projeto contém a pasta nativa `android/`; portanto, alterações futuras no `app.json` devem ser sincronizadas por prebuild ou manualmente.
- O `npm audit` reporta 11 avisos moderados transitivos na cadeia de ferramentas Expo. A correção automática sugerida tenta fazer downgrade incompatível do Expo e não foi aplicada.
- A versão 5 do RNTP exige verificar a licença adequada antes de uso comercial.
- O backup anterior à migração está no commit `d9022b5` e também em `D:\dev\music-app-backups`.
