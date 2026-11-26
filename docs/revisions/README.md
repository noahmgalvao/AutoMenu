# Histórico persistente v1.2 — implementação e ativação

O backend compartilhado foi implantado no Supabase Edge do AutoMenu em 26/11/2026, com migrations aditivas, Storage privado, autenticação própria por `getUser` e autorização de workspace antes de ler estados. O frontend usa esse endpoint por padrão; `VITE_HISTORY_V12_ENABLED=false` desativa a integração antes de uma implantação nova. Não foi alterado o plano, criado serviço pago ou enviado backup de produção a terceiros. Ver o estado observado da implantação em [validação de produção](production-validation.json).

## Stack e fronteiras verificadas

Main oficial inspecionada: `1cf88953ebbad16912f81368f487f01eda8fdb0a`. React 19, TypeScript 5, Vite 5, Express 5, Supabase JS 2.103, PostgreSQL com RLS e Storage; Vercel tem configuração de SPA. Renderer compartilhado `MenuPreview`, publicação existente e perfis de impressão foram reaproveitados. Não houve reescrita de Auth ou dos templates.

Antes: `saveWorkspaceState` inseria `editor_state` e `render_snapshot` completos em `menu_versions` em cada autosave; histórico fazia `SELECT *` sem paginação. Agora, quando ativado, autosave usa CAS e atualiza a linha corrente existente. Fork é necessário se essa linha estiver publicada. O snapshot corrente continua independente das cadeias históricas. As linhas publicadas e as linhas legadas não são apagadas por esta migration.

Undo/redo continua local, com a pilha e agrupamento existentes. A restauração persistente reinicializa essa pilha e recarrega o estado confirmado. Autosave usa debounce de 1 s, max-wait de 5 s, adia gravação de gesto/IME ativo e preserva pendências locais. Checkpoints comuns são consolidados pelo outbox durável após 5 min de alterações ou 90 s sem alterações persistidas. A abertura não cria checkpoints novos; o backfill só converte dados já existentes. Operações estruturais relevantes preservam o estado anterior antes de aplicar a alteração no editor. Conflitos não fazem merge arbitrário: há escolhas explícitas de carregar o salvo ou usar o local, preservando o estado remoto antes da substituição.

## Componentes

- `src/domain/revisions`: política pura normativa, calendário fixo por cardápio (UTC inicial), capacidade, canonicalização e classificação semântica.
- `src/application/revisions`: contratos, LRU autorizado limitado a 4 entradas/4 MiB/240 s e ferramenta de migração de provedores.
- `src/infrastructure/revisions`: codec, BlobStore Supabase, repositório transacional, serviço, assets legados e HTTP autenticado.
- `api/revisions.ts` e `api/revisions-worker.ts`: entradas para o backend Node, também ligadas ao Express existente.
- `supabase/migrations/20261126150000_revision_history_v12.sql`: esquema aditivo, funções somente service-role, RLS de leitura, proteção de clientes antigos, ledger, quotas, outbox, leases, reservas, GC e telemetria.
- `PersistentRevisionHistory`, `RevisionReadOnlyCanvas` e integração no editor: painel sem bloquear o documento; canvas real somente leitura ao selecionar; abas, formulário inline, paginação, filtros, proteção, cópia e restauração.

## Decisão de armazenamento e limites

Supabase Storage **privado** é o adapter inicial, com metadados compactos em PostgreSQL. A escolha foi verificada no projeto Free: antes da migração, banco de 28.404.883 bytes e objetos de 122.305.589 bytes. O teste real confirmou upload/download binário privado com checksum, restauração, cópia, CAS e RLS. Quotas publicadas foram usadas como orçamentos conservadores configuráveis; disco físico, CPU/RAM do provedor e egress da organização não estão acessíveis pela conexão disponível. O uso dos demais projetos da organização também não foi medido. Não se afirma que o limite de 1.000 revisões cabe no Free para qualquer número de cardápios.

Codec aberto/versionado: JSON canônico UTF-8, SHA-256, GZIP v1 ou raw v1 quando menor, patch determinístico v1. A deduplicação é por workspace autorizado. Snapshot se não há base, schema mudou, há 49 deltas, cadeia acumulada passa de 4 MiB, custo estimado de reconstrução passa de 16 MiB ou a reconstrução observada excede 100 ms. Delta só quando ocupa no máximo 70% do snapshot comprimido. Ajustes server-side: `REVISION_DELTA_MAX_RATIO`, `REVISION_CHAIN_BYTES` e `REVISION_RECONSTRUCT_MS`; não são opções do frontend. Documento/payload descomprimido: 8 MiB; até 20.000 operações de patch, profundidade JSON 64, leitura de até 50 estados/16 MiB de payloads. Limites reais da hospedagem podem ser menores e devem ser validados no ambiente de implantação.

Original/protegidas são materializadas quando dependentes. Rebase troca apenas a representação física por CAS, mantém identidade/hash/data/nome e conserva bases ainda referenciadas. Leitores renovam leases dos blobs físicos antes de receber a cadeia. GC em lotes de até 20, com carência padrão de 24 h, tombstones e verificação de alcance. Falha de upload/commit deixa o estado anterior intacto e objetos reservados recuperáveis. O GC de assets exige inventário concluído e só seleciona o domínio novo de assets imutáveis; não apaga arquivos legados desconhecidos.

Assets novos são imutáveis e deduplicados por domínio. Legados data URI de PNG/JPEG/WebP/GIF/TIFF/SVG/WOFF/TTF/OTF são externalizados sem recompressão. Formas estruturadas reutilizam seu modelo e regeneram a URL de desenho. Formatos não suportados são recusados com erro, sem alterar o legado. URLs externas mutáveis são uma limitação de fidelidade; não são buscadas silenciosamente. Assets ausentes bloqueiam a prévia. Nenhuma miniatura histórica permanente é criada. O canvas existente torna todas as páginas acessíveis; não foi substituído por um renderer virtualizado novo.

## Implantação e configuração

Foram aplicadas apenas as migrations relacionadas ao histórico: `revision_history_v12`, `revision_history_edge_runtime` e `revision_history_conflict_response`. O esquema hospedado antigo não tem `catalog_template_backgrounds`; a integração é opcional por detecção de tabela. Não é necessário aplicar migrations de funcionalidades alheias para utilizar este histórico.

Supabase Edge reutiliza o mesmo serviço/repositório/codec do backend Node. A chave de serviço permanece no ambiente gerenciado do Edge. O gateway do provedor tem `verify_jwt=false` porque o handler verifica o JWT real com Auth e a associação ao cardápio. Worker aceita apenas credencial privada gerada no Vault; não aceita chave pública como credencial administrativa. CORS não substitui autorização. O adaptador limita o corpo a 9 MiB e o documento descomprimido a 8 MiB. CPU indisponível no Edge é marcada por zero amostras, sem fingir medição.

Reimplantar depois de validar mudanças:

```sh
npm run history:build:edge
# CLI autenticado com a conta/projeto autorizado; não gravar tokens no repositório.
npx supabase functions deploy menu-revisions --project-ref SEU_PROJECT_REF --no-verify-jwt
```

O arquivo `bundle.js` é gerado e ignorado pelo Git; nunca contém segredos. O build normal não inclui a rotina administrativa de testes. `scripts/revisions-live-validation.ts` cria uma fixture Auth própria, usa login real e remove somente os dados dessa fixture ao terminar. Não manda emails nem imprime credenciais. [Resultados registrados](production-validation.json).

O cron central `automenu-revisions-v12` roda uma vez por minuto e chama `revision_dispatch_worker`. O despacho só usa HTTP se existe job vencido ou a medição central passou de 15 minutos; não existe um cron por cardápio. Configurar `revision_config.worker_url` com a URL HTTPS `/functions/v1/menu-revisions` do próprio projeto. O token fica no Vault. Uma execução Edge processa um cardápio/lote de migração de até 30 estados; leases e cursor permitem retomar. O frontend também pode iniciar a conversão de um cardápio, preservando o estado local quando houver migração pendente. Os checkpoints de 90 s ficam sujeitos à resolução do cron de até um minuto, além do tempo da execução/fila.

`revision_config.enabled` controla novos checkpoints. O editor usa Edge por padrão; o backend Node existente continua disponível ao configurar `VITE_REVISION_BACKEND=node`, `HISTORY_V12_ENABLED=true`, `SUPABASE_URL` e `SUPABASE_SERVICE_ROLE_KEY`. Não executar dois schedulers centrais. Para outro projeto, manter a flag frontend falsa até aplicar migrations, verificar capacidade, configurar worker e testar o endpoint. Depois de migrar cardápios, pausar checkpoints preserva o autosave CAS; não voltar a habilitar escritores legados sem uma migração própria de rollback.

O ledger legado foi inventariado sem apagar objetos. GC de produção permanece desativado: exige backup externo verificado, revisão das referências e autorização para manutenção destrutiva. O código de GC/rebase foi testado em PostgreSQL isolado; isso não equivale a executar coleta em produção. Rotinas e comandos de backup de banco **e objetos**, diagnóstico, restauração e migração futura de provider estão em [operação](operations.md) e [migração](provider-migration.md). Nenhuma conta R2 foi criada e nenhum provider real alternativo foi testado.

As capacidades 1.000/100 e reservas 100/150 são configuradas no backend. Cada cardápio guarda seu limite de retenção; reduzir o singleton não elimina versões existentes. Divergência de limite interrompe a compactação e exige migração administrativa deliberada. A idade/inatividade nunca é gatilho de descarte.

## Validação e medições

[Resultados e limitações](validation.md), [benchmark de payload](benchmark-fixtures.json) e [benchmark de metadados PostgreSQL isolado](benchmark-postgres-fixture.json). Os benchmarks de compressão/p50/p95 são de fixtures, separados do teste funcional real. Não incluem cobrança do Supabase. O teste real teve uma amostra por operação: autosave 410 ms, versão manual 1.024 ms e restauração 521 ms; não são percentis. Egress/cache, disco/WAL e RPO/RTO de produção continuam sem medição. O cron e o backfill devem ser acompanhados pelo diagnóstico abaixo e por `net._http_response`; não confundir job SQL bem-sucedido com resposta HTTP bem-sucedida.
