# Validação v1.2

## Ambiente e dados

Node 24.22.3, PostgreSQL isolado via PGlite, Chromium headless local. Conexão Supabase administrativa disponibilizada em 26/11/2026. Testes de invariantes usam fixtures; validação funcional adicional rodou no projeto real com conta descartável própria, sem modificar documentos de usuários. Sem credenciais de R2/S3. `pg_dump`, `pg_restore` e `age` não estão instalados neste workspace: execução real do CLI de backup não foi validada. Teste isolado cobre dump PostgreSQL/PGlite, manifesto dos objetos e restauração criptografada AES-GCM; não equivale a RPO/RTO do serviço real.

## Comandos executados

```sh
npm run typecheck
npm run test
npm run build
npm run history:benchmark
npm run history:benchmark:metadata
npm run history:backup
node --import tsx --test tests/revision-sql.test.ts tests/revision-backup.test.ts
npm exec -- playwright test --config playwright.local.config.ts tests/revision-history.spec.ts --workers=1
npm exec -- playwright test --config playwright.local.config.ts tests/export-fidelity.spec.ts --workers=1
```

O arquivo local de configuração de Playwright só aponta para o Chromium disponível (`/tmp/chromium`); não faz parte da entrega. Em ambiente com browser instalado, usar a configuração padrão e `npm run test:e2e -- tests/revision-history.spec.ts tests/export-fidelity.spec.ts`.

Cobertura automatizada nova:

- 85 antigas, 85+40 em meses distantes, 1.000/1.001, 2.400 em mês ativo, meses antigos/novos, escassez, ordem justa, calendário/fusos/DST e incremento idempotente.
- Original separada, quota protegida concorrente, número manual monotônico, nomes personalizados, cancelamento/falha/retry, fixar/desproteger e conflito CAS.
- Autosave coalescido, A→B→A, outbox persistente, restauração pré/pós/idempotência/leases, cópia independente e publicação preservada.
- GZIP/raw, hash, Unicode, arrays/tipos/remoções/reordenação, limites de patch/JSON/descompressão, cadeia/ancoragem, deduplicação física, rebase e falha de integridade.
- Bases físicas ainda necessárias, GC com leitor/backup ativo, ledger e GC de assets, upload ausente, reservas e limiares/histerese com métricas antigas.
- RLS entre contas e funções de serviço privadas, migração reaplicável sem remover legados, contratos de Storage em dois adapters de teste/Supabase mock, cópia de provedor interrompida, checksum, CAS e rollback.
- Browser mobile/desktop: metadados somente ao abrir, cursor de 30, tooltip por clique, formulário inline só em Protegidas, erro preservando o nome/número, preview real de todas as páginas e restauração confirmada.
- Exportação existente PDF/JPG em duas e três colunas e erro de captura sem renderer alternativo.

## Benchmarks medidos

65 estados por fixture, documentos de 15/180/900 produtos. Resultados completos em `benchmark-fixtures.json`: bytes reais comprimidos, escolha snapshot/delta, profundidade, CPU, p50/p95 de encode/reconstrução, RSS e pico calculado dos buffers/payloads durante rebase. Snapshot é antecipado por latência observada; o benchmark não extrapola para o provedor.

Na execução registrada:

| Fixture | Snapshots GZIP/raw | Híbrido | Encode híbrido p95 | Reconstrução p95 |
|---|---:|---:|---:|---:|
| Pequena | 86.544 B | 23.268 B | 4,17 ms | 24,64 ms |
| Média | 309.730 B | 34.653 B | 8,94 ms | 64,05 ms |
| Grande | 1.186.872 B | 164.785 B | 35,53 ms | 106,81 ms |

São payloads de fixtures com alterações localizadas, sem imagens duplicadas. Não representam taxas garantidas, custo total de banco/índices, egress ou latência de rede. RSS é high-water cumulativo do processo; o relatório distingue isso dos bytes de buffers e do pico físico de payloads. O benchmark PostgreSQL mede relações e índices de 100 entradas sintéticas com as funções reais de tamanho; não corresponde ao projeto hospedado.

## Limitações de validação e implantação

Migrations do histórico e agendamento central foram instalados no projeto. O backend Supabase passou no teste real de Auth, CAS, idempotência, blobs privados, RLS, SVG original, restauração e cópia (ver `production-validation.json`). O teste identificou e corrigiu uso de SQLSTATE de serialização para conflito de aplicação, que causava repetição/timeout; conflitos de aplicação agora usam PT409 e são normalizados para o editor. Nenhum GC de produção, backup externo real ou migração real de provedor foi realizado. Não declarar R2 testado.

A suíte geral antiga `app-workspace.spec.ts` também foi executada e apresentou falhas. Foi comparada com uma cópia limpa da main anterior: falhas de publicação/exportação param no fluxo existente de dicas opcionais; outros casos usam expectativas antigas de UI. A suíte nova de histórico e a suíte de fidelidade de exportação são reportadas separadamente. Essas falhas não foram ocultadas nem tratadas como testes aprovados; não foram feitas mudanças em publicação, dicas ou controles fora do escopo para fazê-las passar. Ver resumo final de execução no encerramento da entrega.

Pendências: fontes e URLs externas mutáveis; corrida real entre dois aparelhos físicos; egress/cache/billing da organização; restauração externa `pg_dump`+objetos+Auth isolada; migração real de provedor e rendimento em celulares. CAS stale/write, SQL atômico e autorização foram testados pela rede. Não prometer esses resultados com base em mocks/fixtures. A flag é a fronteira de segurança para essa implantação gradual.

## Resumo da execução final

- TypeScript e build de produção: aprovados.
- Suíte Node completa: 77 testes aprovados, incluindo serviço/repositório reais ligados ao PostgreSQL isolado por uma ponte de testes compatível com PostgREST; Storage é um adapter de fixture, não Supabase ao vivo.
- Histórico no navegador: 4 casos aprovados (393 px, 1280 px, restauração/todas as páginas, teclado/cancelamento rápido).
- Fidelidade de exportação: 3 casos aprovados. Login/offline e recuperação de bundle também passaram em repetição dirigida.
- Suíte antiga de workspace: 15 aprovados / 14 falhas na execução ampla (inclui três casos novos de histórico nessa contagem inicial). Comparação limpa da main anterior: 12 aprovados / 14 falhas; 13 falhas se repetem entre as execuções. O caso de startup que falhou nesta execução passou ao repetir isoladamente; o login que falhou no baseline também passou na execução dirigida atual. Não se declara a suíte antiga integralmente verde.
- Backup/asset inventory em dry-run: executados sem conexão/transferência externa.
- Migrations, bucket privado, configuração de orçamentos e cron central instalados no Supabase; teste real detalhado em `production-validation.json`. Backup externo/GC de produção/migração de provedor não executados. O estado final do cron/backfill consta em `production-inventory.json`.

Validação adicional de admissão: o teste detectou que candidatos poderiam ser reavaliados durante o UPDATE de leases. A migration corretiva usa CTE MATERIALIZED antes da alteração e testa limite global, leases de outras invocações, prioridade do estado persistido e modo de 85%/95%. O esquema completo aplica as duas migrations em ordem; a falha intermediária foi corrigida e a suíte final passou. Validação de rede adicional: escritores simultâneos, URL assinada autorizada/recusa por namespace e cron após desconexão. As fixtures Auth/Storage foram removidas ao final; usuários/documentos existentes não foram excluídos.

Fechamento real: 641 versões mapeadas, 10 cardápios convertidos, fila vazia, nenhum erro de job e nenhuma fixture Auth remanescente. Artefatos: `production-inventory.json` (bytes e migrations) e `production-validation.json` (operações pela rede/cron e limitações da amostra). O teste do cron teve pausa deliberada de despacho durante correção SQL; registra 90 s de prazo no outbox e 305,5 s até o checkpoint observado, sem alegar SLA normal de 90 s. A Vercel reportou sucesso e o bundle público entrega o novo gateway.
