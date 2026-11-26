# Operação, diagnóstico e recuperação

## Inventário e capacidade

Não alterar plano nem contratar serviço automaticamente. Confirmar o plano e quotas no dashboard oficial antes de cadastrar limites: https://supabase.com/dashboard. Referências operacionais: https://supabase.com/docs/guides/platform/database-size e https://supabase.com/docs/guides/platform/manage-your-usage/egress. Os scripts não presumem quotas comerciais atuais.

Consultas somente leitura, com acesso administrativo autorizado:

```sql
select pg_database_size(current_database()) as database_bytes;
select relname,pg_total_relation_size(relid) as relation_bytes,
       pg_indexes_size(relid) as index_bytes
from pg_catalog.pg_statio_user_tables order by relation_bytes desc;
select bucket_id,count(*),sum(case when metadata->>'size' ~ '^\d+$'
 then (metadata->>'size')::bigint else 0 end) as object_bytes
from storage.objects group by bucket_id;
select namespace,sum(byte_length),count(*) from revision_blobs group by namespace;
select namespace,representation,count(*),max(chain_depth),sum(byte_length)
from revision_states group by namespace,representation;
select menu_id,count(*) filter(where protection is null) as automatic,
 count(*) filter(where protection='user') as protected,
 count(*) filter(where protection='original') as original
from menu_revisions group by menu_id;
select resource,sum(bytes) as bytes_in_flight from revision_reservations
where expires_at>now() group by resource;
select due_at,attempts,last_error from revision_jobs order by due_at limit 30;
select * from revision_capacity_alerts order by created_at desc limit 30;
```

Essas consultas não medem todo disco físico, WAL, bloat, billing, egress da organização, cache hit, CPU ou RAM do provedor. Marcar métricas inacessíveis como indisponíveis. O banco recebe métricas verificadas neste formato (valores de exemplo **não são quotas reais**):

```json
{
  "database":{"used":null,"limit":null,"observedAt":null,"source":"unavailable"},
  "disk":{"used":null,"limit":null,"observedAt":null,"source":"unavailable"},
  "storage":{"used":null,"limit":null,"observedAt":null,"source":"unavailable"},
  "egressCached":{"used":null,"limit":null,"observedAt":null,"source":"unavailable"},
  "egressUncached":{"used":null,"limit":null,"observedAt":null,"source":"unavailable"},
  "cpu":{"used":null,"limit":null,"observedAt":null,"source":"unavailable"},
  "memory":{"used":null,"limit":null,"observedAt":null,"source":"unavailable"}
}
```

O worker faz uma medição central de `pg_database_size` e metadados de tamanho dos objetos Supabase, sem consultas por autosave; ausência de tamanho torna Storage indisponível nessa medição. Configurar os limites reais separadamente. Disco físico/WAL, billing, egress e CPU/RAM do provedor continuam exigindo integração/administração verificadas. Usar `revision_record_metrics` centralmente, não por autosave. Níveis internos 50/70/85/95%, alertas com cooldown de 1 h. Emergência mantém histerese até dados saudáveis abaixo de 80%; métricas críticas antigas/ausentes não comprovam recuperação. Reservas concorrentes incluem Storage e estimativa conservadora de metadados/disco. Estimativa não é cobrança nem prova de espaço livre. Falta de acesso a métricas impede afirmar monitoramento completo.

Em 85%, revisar projeções e órfãos, serializar tarefas não essenciais. Em 95%, pausar novos checkpoints; não apagar histórico. Autosave permanece independente quando o banco aceita escrita. Se o próprio banco estiver somente leitura, mostrar o erro e preservar pendência local. Destrutivas exigem checkpoint prévio durável e são recusadas se ele não puder ser garantido. Versão manual recusada não consome número.

`revision_telemetry` agrega por workspace/hora wall time, CPU do processo Node, RSS, payloads e histograma de latência. Limites superiores dos buckets, em ms: `[1,5,10,25,50,100,250,500,1000,2500,5000,+∞]`. P50/P95 operacionais podem ser estimados pelo primeiro bucket cuja soma acumulada alcance 50%/95%; os percentis exatos do benchmark são reportados separadamente. CPU/RSS do processo não medem a CPU/RAM do PostgreSQL nem isolam requisições simultâneas. Não registrar documentos, nomes, tokens ou URLs assinadas nos logs. Agregados operacionais podem ter retenção administrativa delimitada; isso não autoriza remover revisões.

## Scheduler e falhas parciais

Uma invocação `npm run history:worker` executa no máximo 10 jobs. O endpoint HTTP exige Bearer `REVISION_WORKER_SECRET`. Agendar centralmente a cada 30–60 s na infraestrutura existente autorizada. Usar somente recursos já disponíveis; nenhuma contratação/agendamento foi feito nesta entrega. Para Supabase Cron/pg_net já instalado, configurar chamada HTTPS autenticada com segredo no Vault pelo procedimento oficial da infraestrutura; não colocar o segredo em migration versionada. Verificar heartbeat, atraso da fila e execução após fechar todos os clientes. Sem esse teste, não anunciar consolidação offline como operacional em produção.

Jobs usam leases de 2 min, retomada, idempotência e backoff limitado a 1 h. Checkpoint lê exclusivamente o estado atual já persistido. Upload pendente tem lease de 10 min. O otimizador avalia no máximo três candidatos por execução e materializa apenas quando o snapshot economiza bytes sobre bases exclusivamente necessárias; reserva o pico antes do upload e pausa em pressão. GC exige carência de 24 h, dependências/ref ledger e novo teste de alcance. Falha do processo após upload deixa objeto reconhecível. Falha após commit pode ser repetida com a mesma chave; contador não avança novamente. CAS rejeitado não troca o estado. Nunca reiniciar uma operação manual com outra chave automaticamente. Chaves de requisição carregam o instante de criação e expiram em 7 dias; recibos compactos duram 30 dias. Replays expirados são recusados, em vez de consumir outro número após a limpeza operacional. Autosave reaberto pode usar nova chave mantendo o CAS original, portanto não sobrescreve silenciosamente um save já confirmado.

Para recuperar: verificar saúde/configuração e motivo real, conferir `revision_jobs`, leases e reservas; deixar lease expirar e worker retomar. Não apagar leases de uma operação ativa. Não baixar carência para tentar resolver falta de espaço sem provar ausência de referências. Não executar VACUUM FULL, rewrites ou exclusões em massa sem autorização/janela. Autovacuum normal pode recuperar espaço reutilizável sem reduzir imediatamente tamanho físico.

Backfill não apaga os JSONs legados. Portanto, durante a implantação há consumo transitório adicional. Para liberar esses bytes seria necessário um projeto de limpeza **autorizado**, com comprovação de migração/referências e backup, não incluído na ativação automática. Exclusões definitivas existentes precisam preservar/reconciliar referências compartilhadas; não contornar FKs para forçar exclusão de assets usados por outros documentos/publicações/templates.

## Backup externo: banco E objetos

Histórico não substitui backup. Rotina sugerida: diária e incremental de objetos imutáveis conforme criticidade, retenção definida pelo proprietário. Não há transferência externa nem serviço pago configurados. É necessário destino independente autorizado, `pg_dump` compatível com a versão do servidor, `age`, diretório protegido e chave pública do destinatário. Credenciais via ambiente/cofre, nunca argumentos/logs.

```sh
npm run history:backup
# Somente após autorizar/configurar destino e verificar ferramentas:
npm run history:backup -- --execute --authorized-destination
```

O dry-run não abre conexão. Execução exporta PostgreSQL, copia separadamente todos os buckets (originais e arquivos publicados inclusos), produz manifesto SHA-256/tamanhos e criptografa o arquivo. O dump SQL não inclui bytes de Storage. Há lease global de backup, que bloqueia o GC por até 24 h; conservar GC pausado enquanto verificar a consistência. Clientes antigos que sobrescrevam recursos mutáveis exigem congelamento de escrita durante o backup. Banco e objetos têm que corresponder ao mesmo conjunto de referências: objetos adicionais são aceitáveis; objeto referenciado ausente invalida o backup. O script não declara restauração verificada só porque terminou a cópia.

Restauração em ambiente **isolado**:

1. Provisionar ambiente de teste autorizado, sem apontar URLs/chaves de produção. Descriptografar localmente com a chave privada fora do repositório.
2. Validar SHA-256 e tamanho de `database.dump` e cada entrada `objects/*` contra `manifest.json`. Interromper se faltar arquivo/hash divergir.
3. Usar `pg_restore` conforme privilégios/esquemas do Supabase e importar cada objeto para o bucket/chave do manifesto, privado. Restore de Auth/roles e de metadados Storage depende da versão real; seguir o procedimento de restauração do projeto, sem sobrepor produção.
4. Checar FKs, RLS entre contas, hashes de snapshots/deltas, assets, cópia, prévia, publicação e um save CAS. Verificar manifesto de locators e disponibilidade de cada objeto.
5. Medir fim do último backup durável (RPO) e tempo total até serviço validado (RTO). Registrar números de produção apenas se medidos. O teste automatizado isolado usa PGlite + AES-GCM/objetos fixtures; não substitui ensaio do CLI `pg_dump`/`age`/Supabase real.

## Migração futura de blobs

Ver [portabilidade](provider-migration.md). Não trocar banco/Auth, DNS ou plano por uma flag. Não apagar origem automaticamente.

## Recuo da implantação

Antes de converter qualquer cardápio, desligar as flags mantém o fluxo antigo sem remover dados. Depois de converter, o rollback operacional seguro é pausar **novos checkpoints** (`revision_config.enabled=false` ou `checkpoint_pause_reason`) mantendo o pipeline CAS do editor v1.2 e a leitura do histórico. Não reativar gravações de clientes antigos em cardápios convertidos: os guards permanecem ativos para impedir sobrescritas silenciosas. O estado atual continua em `menu_versions`, sem depender do histórico para abrir.

Reverter também o pipeline de gravação exige janela sem escritores, backup verificado, exportação do estado corrente e coordenação de todos os clientes/serviços. Não executar DROP das tabelas novas nem liberar guards só para fazer um cliente antigo salvar. Essa reversão de dados não foi executada em produção. As migrations são aditivas; os dados antigos e atuais continuam disponíveis para uma recuperação autorizada.

## Supabase Edge implantado em 26/11/2026

Verificar separadamente o cron e o HTTP, sem consultar/imprimir o token do Vault:

```sql
select jobname,schedule,active from cron.job where jobname='automenu-revisions-v12';
select status,return_message,start_time,end_time from cron.job_run_details order by runid desc limit 10;
select id,status_code,timed_out,error_msg from net._http_response order by id desc limit 10;
select count(*) migrated from revision_menu_state where migrated;
select count(*) pending from revision_jobs;
select kind,representation,count(*) from menu_revisions r join revision_states s on s.id=r.state_id group by 1,2;
select capacity_level,checkpoint_pause_reason,metrics from revision_config;
```

`revision_config.worker_url=null` suspende despachos. `enabled=false` pausa checkpoints; manter o backend/autosave CAS e as filas locais. Não alterar plano nem desativar read-only do banco automaticamente. O cron não faz GC em produção. Credencial: Vault `automenu_revision_worker`, nunca copiada ao frontend. Rotação deve atualizar o segredo no Vault, sem registrar seu valor em logs.

Os advisors de segurança foram consultados antes e depois. Tabelas internas têm RLS e nenhum grant/policy de cliente por desenho; metadata de revisões tem leitura por workspace. A função booleana `revision_storage_guard` é intencionalmente executável por authenticated para policies restritivas de Storage, com search_path fixo e sem devolver documentos. Avisos herdados de search_path, unaccent e Auth estão fora do escopo. Referências: [RLS interno sem policy](https://supabase.com/docs/guides/database/database-linter?lint=0008_rls_enabled_no_policy), [funções SECURITY DEFINER](https://supabase.com/docs/guides/database/database-linter?lint=0029_authenticated_security_definer_function_executable), [search_path](https://supabase.com/docs/guides/database/database-linter?lint=0011_function_search_path_mutable).
