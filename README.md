PROMPT DE DESENVOLVIMENTO: Módulo WhatsApp Engine API (Camada 1)

Objetivo: Construir uma API RESTful em Node.js para gestão de sessões do WhatsApp (utilizando a biblioteca @whiskeysockets/baileys), organizações, contactos, grupos e mensagens.

Contexto Arquitetural: Esta API funcionará como o motor principal de comunicação. Ela não deve conter regras de negócio externas (como fluxos de Salesforce ou Slack), mas deve ser perfeitamente agnóstica e registar tudo numa base de dados relacional. Estes registos servirão como base (eventos/triggers) para um sistema de filas e webhooks futuro.

1. REGRAS GLOBAIS DA APLICAÇÃO

Tecnologias: Node.js, Express, Prisma ORM, PostgreSQL, @whiskeysockets/baileys (v6+).

Multi-Tenancy: Absolutamente todas as entidades da base de dados e rotas da API devem estar isoladas por org_id (ID da Organização).

Autenticação de API: Todas as rotas devem validar um cabeçalho x-api-key que deve corresponder ao api_key da Organização na base de dados.

Resiliência de Sessão: As sessões do Baileys devem usar um AuthStore customizado para ler/gravar as chaves (creds e keys) diretamente no PostgreSQL, nunca em ficheiros locais.

2. ESQUEMA DE BASE DE DADOS (PRISMA)

A IA deve criar os seguintes modelos (schema.prisma):

Organization: id, name, api_key, created_at

Channel: id, org_id, phone_number, status (DISCONNECTED, CONNECTED, AWAITING_QR), type (CENTRAL, PESSOAL)

Session: id, channel_id, key_id, data (Texto JSON)

Contact: id, org_id, name, phone_number (JID do WhatsApp), created_at

Group: id, org_id, channel_id, wa_group_id, name, description, created_at

GroupParticipant: id, group_id, contact_id, role (ADMIN, MEMBER)

Message: id, org_id, channel_id, wa_message_id, remote_jid, direction (INBOUND, OUTBOUND), source_system (API, WHATSAPP_DEVICE), content (JSON), status (SENT, DELIVERED, READ, ERROR), is_deleted, created_at

EventLog: id, org_id, entity_type (MESSAGE, GROUP, CONTACT, SESSION), entity_id, action (CREATED, UPDATED, DELETED), payload (JSON), created_at

3. ROTAS E REGRAS DE NEGÓCIO

Módulo 1: Gestão de Organização e Canais

Rotas REST:

POST /api/organizations - Criar organização (gera e devolve api_key).

GET /api/organizations/:id - Ler detalhes.

POST /api/channels - Criar canal (Exige org_id no header, recebe phone_number e type).

GET /api/channels - Listar canais da organização.

Módulo 2: Autenticação de Sessão (Login/Logout)

Rotas REST:

POST /api/channels/:id/login - Instancia o makeWASocket. Se não houver sessão, gera e devolve o QR Code (Base64). Se houver, restabelece a conexão.

GET /api/channels/:id/status - Retorna o estado atual da conexão (status do Channel) e o QR Code se estiver em AWAITING_QR.

POST /api/channels/:id/logout - Chama sock.logout(), atualiza o status para DISCONNECTED e apaga os registos associados na tabela Session.

Módulo 3: Mensagens Outbound (Envio)

Regra de Negócio Crucial (Origem Externa): A API deve entender que a mensagem pode ser gerada por aplicações terceiras (ex: Salesforce/Middleware). O sistema deve usar o número do canal para enviar, mas registar a origem correta.
Rotas REST:

POST /api/channels/:id/messages - Criar/Enviar. \* Recebe: to (JID), content (Texto/Mídia), source_system (ex: "MIDDLEWARE").

Ação: Chama sock.sendMessage(). Grava na tabela Message com direction = OUTBOUND e source_system = MIDDLEWARE. Grava na tabela EventLog.

PUT /api/channels/:id/messages/:wa_message_id - Editar. \* Ação: Usa a função do Baileys para editar a mensagem enviada. Atualiza a tabela Message e EventLog.

DELETE /api/channels/:id/messages/:wa_message_id - Excluir/Revogar. \* Ação: Usa a função do Baileys para apagar a mensagem para todos. Atualiza is_deleted = true na base de dados e grava no EventLog.

GET /api/channels/:id/messages - Ler. Retorna o histórico de mensagens outbound (com filtros por remote_jid).

Módulo 4: Mensagens Inbound (Receção)

Regra de Negócio: Mensagens recebidas fisicamente de contactos externos, ou enviadas pelo próprio utilizador a partir do telemóvel físico (onde msg.key.fromMe == true).
Eventos Baileys (messages.upsert):

Quando uma mensagem chega, o sistema não expõe um endpoint POST para criação, mas sim um listener interno.

O listener deve gravar a mensagem na tabela Message com direction = INBOUND (se vier de fora) ou direction = OUTBOUND com source_system = WHATSAPP_DEVICE (se enviada pelo telemóvel do utilizador conectado).

Gravar a ação na tabela EventLog.
Rotas REST:

GET /api/channels/:id/messages/inbound - Ler. (Com paginação e filtros).

DELETE /api/channels/:id/messages/inbound/:wa_message_id - Excluir. Apenas apaga/oculta o registo na base de dados local (não revoga no WhatsApp do remetente). Grava no EventLog.

Módulo 5: Gestão de Contactos da Organização

Rotas REST:

POST /api/contacts - Criar. Grava um novo contacto associado à org_id.

PUT /api/contacts/:id - Editar. Atualiza nome/número.

GET /api/contacts - Ler. Lista os contactos da organização.

DELETE /api/contacts/:id - Excluir. Remove o contacto da BD.

Nota: Todas estas ações devem gerar um registo na tabela EventLog (entity_type = CONTACT).

Módulo 6: Gestão de Grupos

Regra de Negócio: A criação de grupos na API deve refletir fisicamente no WhatsApp via Baileys e vice-versa.
Rotas REST:

POST /api/channels/:id/groups - Criar. \* Chama sock.groupCreate(name, participants). Salva na tabela Group e GroupParticipant. Gera EventLog.

PUT /api/channels/:id/groups/:wa_group_id - Editar. \* Adicionar/remover participantes via sock.groupParticipantsUpdate(). Atualizar DB e EventLog.

GET /api/channels/:id/groups - Ler. Retorna metadados dos grupos daquele canal.

DELETE /api/channels/:id/groups/:wa_group_id - Excluir. \* Chama sock.groupLeave(). Atualiza o status no DB. Gera EventLog.

Módulo 7: Triggers e Tabela de Eventos (Readiness)

Para garantir que outros microsserviços (middlewares/filas) possam processar as ações de forma assíncrona futuramente, toda e qualquer mutação (POST, PUT, DELETE) ou evento do WebSocket do Baileys deve obrigatoriamente inserir uma linha na tabela EventLog.
Exemplo do payload do EventLog ao receber uma mensagem:

{
"org_id": "123",
"entity_type": "MESSAGE",
"entity_id": "wa_msg_999",
"action": "CREATED",
"payload": { "remote_jid": "551199999999@s.whatsapp.net", "content": "Olá" }
}

Opcional para a IA: Implementar webhooks simples que disparam o conteúdo de EventLog para um endpoint externo configurado na Organization, habilitando a arquitetura orientada a eventos.

Instrução Final para a IA:
Inicia a criação deste módulo gerando o ficheiro schema.prisma e, de seguida, implementa o servidor Express focando-te na estrutura modular de controladores (Controllers) e serviços (Services). Garante que o ficheiro de serviço do Baileys (whatsapp.service.ts) isola perfeitamente as instâncias de Socket por canal num Map em memória.
