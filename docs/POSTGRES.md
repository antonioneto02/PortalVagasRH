# Banco de dados: SQL Server hoje, PostgreSQL quando quiser

Mesmo padrão do Planner Cini.

## Como está organizado

| Conexão | Arquivo | Banco | Variáveis |
|---|---|---|---|
| Tabelas próprias (`RH_USUARIOS`, `RH_VAGAS`, `RH_CANDIDATURAS`, `RH_ESTOQUE_TI`, `RH_ESTOQUE_ITENS`, `RH_PEDIDOS_COMPRA_TI`, `RH_MERCADO_SUL`, `RH_SLA_CONFIG`) | `database/sequelize.js` | `mssql` (padrão) ou `postgres` | `DB_DIALECT`, `DB_SERVER`, `DB_PORT`, `DB_USER`, `DB_PASSWORD`, `DB_DATABASE`, `DB_SSL=1` |
| DW (`V_PARTICIPANTES`, `V_RECURSOS_HUMANOS`, `DIM_FILIAIS`, fila de notificações) e Protheus | `database/dbConfigDw.js`, `database/dbConfigProtheus.js` (pacote `mssql`) | sempre SQL Server | `PORTAL_DB_SERVER`, `PORTAL_DB_PORT`, `PORTAL_DB_USER`, `PORTAL_DB_PASSWORD` (se vazios, usam os `DB_*`), `DB_DATABASE_DW`, `DB_DATABASE_PROTHEUS` |

- `models/`: models Sequelize das tabelas próprias; a ordem de migração (`ORDEM`) em `models/index.js`.
- Nas tabelas próprias não se escreve SQL à mão: tudo passa pelo ORM. Contagens que antes eram subconsultas em SQL (alocações, pedidos pendentes, itens reservados) são feitas pelo ORM e combinadas em JS. A baixa de estoque ao fechar vaga usa atualização condicional (só baixa se ainda houver quantidade). No SQL Server as datas continuam gravadas em UTC, como o app sempre fez.
- `SQL/*.sql`: DDL do SQL Server. `database/sql/postgres/create_tables.sql`: DDL do PostgreSQL.

Sem nenhuma variável nova no `.env`, o app continua exatamente como antes (SQL Server).

## Trocar para PostgreSQL

1. Crie o banco: `CREATE DATABASE portal_rh ENCODING 'UTF8';`
2. Copie os dados (só lê o SQL Server; cria as tabelas, copia tudo e acerta as sequências de `ID`):
   ```
   DESTINO_DB_SERVER=... DESTINO_DB_PORT=5432 DESTINO_DB_USER=... DESTINO_DB_PASSWORD=... DESTINO_DB_DATABASE=portal_rh npm run db:migrar:postgres
   ```
3. No `.env`:
   ```
   DB_DIALECT=postgres
   DB_SERVER=<postgres>  DB_PORT=5432  DB_USER=...  DB_PASSWORD=...  DB_DATABASE=portal_rh
   PORTAL_DB_SERVER=<sql server de antes>  PORTAL_DB_USER=...  PORTAL_DB_PASSWORD=...
   ```
4. Reinicie o app. Para voltar, basta remover `DB_DIALECT` e restaurar os `DB_*`.

## Testes

- `npm run test:unit`: sem banco (roda no CI). Confere a escolha do dialeto, que as conexões legadas seguem no SQL Server e que o DDL do PostgreSQL tem todas as tabelas/colunas dos models.
- `npm run test:integracao`: contra bancos reais, exercitando listagem de vagas, fechamento de vaga com baixa de estoque, estoque e disponibilidade.
  - SQL Server (usa o `.env`; tudo roda numa transação desfeita no fim, nada é gravado e o `IDENTITY` das tabelas volta ao valor anterior; testes de gravação são pulados se o usuário do `.env` não tiver permissão): `TESTE_DIALETO=mssql npm run test:integracao`
  - PostgreSQL (banco vazio de teste): `TESTE_DIALETO=postgres TESTE_PG_SERVER=localhost TESTE_PG_PORT=5432 TESTE_PG_USER=postgres TESTE_PG_PASSWORD=... TESTE_PG_DATABASE=teste_portal_rh npm run test:integracao`

## Mudanças de comportamento

- Datas sem hora (abertura, prazo, contratação) agora aparecem iguais ao banco. Antes apareciam **dois dias antes** (ex.: vaga aberta em 13/05 aparecia 11/05), por dupla conversão de fuso na leitura.
- Datas sem hora vindas do formulário são gravadas como texto `AAAA-MM-DD`, sem passar por `Date` (evita gravar o dia anterior).
- `DTALTERACAO` do estoque passa a ser gravada em UTC, como as demais datas do app (antes era a única gravada no horário local).
- Observação: o usuário do `.env` atual (`portal.consultas`) não tem permissão de INSERT/UPDATE/DELETE no `portal_rh`; o app não consegue gravar hoje, independentemente desta mudança.
- **Regras CHECK do SQL Server não copiadas:** `RH_VAGAS` (`TIPO_VAGA`, `STATUS`, `CLASSIFICACAO`, `NOTEBOOK`, `CELULAR`), `RH_ESTOQUE_TI.TIPO_PRODUTO`, `RH_PEDIDOS_COMPRA_TI.STATUS` e `RH_ESTOQUE_ITENS.STATUS` têm CHECK no SQL Server, mas os logins do app não podem ler a definição. No PostgreSQL essas colunas ficam sem a restrição (o app já só grava os valores válidos). Para replicá-las, alguém com `VIEW DEFINITION` no `portal_rh` roda `SELECT OBJECT_NAME(parent_object_id), name, definition FROM sys.check_constraints` e as regras entram em `database/sql/postgres/create_tables.sql`.
