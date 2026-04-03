# WhatsApp Engine API

Servidor Node.js + Express para integração com a **WhatsApp Business API (Meta)**. Permite envio e recebimento de mensagens via webhooks.

## Endpoints

| Método | Rota       | Descrição                     |
| ------ | ---------- | ----------------------------- |
| `GET`  | `/`        | Health check                  |
| `GET`  | `/webhook` | Verificação do webhook (Meta) |
| `POST` | `/webhook` | Receber mensagens/eventos     |
| `POST` | `/send`    | Enviar mensagem de texto      |

## Enviar Mensagem

```bash
curl -X POST http://localhost:3000/send \
  -H "Content-Type: application/json" \
  -d '{"to": "5511999999999", "message": "Olá! Teste de mensagem."}'
```

## Configuração

1. Copie `.env.example` para `.env` e preencha as variáveis:

```bash
cp .env.example .env
```

2. Instale as dependências:

```bash
npm install
```

3. Rode localmente:

```bash
npm run dev
```

## Variáveis de Ambiente

| Variável                       | Descrição                         |
| ------------------------------ | --------------------------------- |
| `PORT`                         | Porta do servidor (padrão: 3000)  |
| `WHATSAPP_API_TOKEN`           | Token de acesso permanente (Meta) |
| `WHATSAPP_PHONE_NUMBER_ID`     | ID do número de telefone no Meta  |
| `WHATSAPP_BUSINESS_ACCOUNT_ID` | ID da conta Business no Meta      |
| `WHATSAPP_API_VERSION`         | Versão da API (ex: `v19.0`)       |
| `WEBHOOK_VERIFY_TOKEN`         | Token para verificação do webhook |

## Deploy no Heroku

```bash
heroku create whatsapp-engine-api
git push heroku main
heroku config:set WHATSAPP_API_TOKEN=seu_token
```
