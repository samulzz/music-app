# Implantação de teste do NationMusics

Implantação ativa em `/opt/nationmusics-test` no servidor de testes.

- API pública: `https://marlonbarbershop.com/nationmusics/api`
- APK: `https://marlonbarbershop.com/nationmusics/download/nationmusics.apk`
- Container: `nationmusics-test-api`
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

## Operação

```bash
cd /opt/nationmusics-test
docker compose ps
docker compose logs -f --tail=100
docker stats nationmusics-test-api
```

## Limitação conhecida

O YouTube está bloqueando o IP da VPS com a validação antirrobô. Cadastro, login, sessão, banco, API e download da APK funcionam normalmente. Busca e conversão de músicas do YouTube exigem um arquivo de cookies válido ou um proxy residencial.

Não use APIs públicas aleatórias como substituição: elas são instáveis e podem expor tráfego ou credenciais.
