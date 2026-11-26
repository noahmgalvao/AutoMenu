# Portabilidade de conteúdo binário

Domínio, retenção, codec e UI não dependem do SDK de Storage. `BlobStore.planImmutable` determina um locator estável antes do upload para registrar o journal de falhas; `putImmutable` deve devolver a mesma localização. O contrato recebe bytes e retorna locators (`provider_id`, container, chave opaca, tamanho, SHA-256 e generation). Metadados persistem locators, nunca URLs assinadas como identidade. PostgreSQL, RLS e Auth existentes continuam sendo as fronteiras de autorização/transação; mudar esses serviços seria outro projeto.

Adapter inicial implementado: `SupabaseBlobStore`, com put imutável, get/head verificando checksum/tamanho, remove por geração e leitura autorizada/TTL máximo de 300 s. Testado com SDK/Storage mock, não contra o projeto real. `head` faz download verificado no adapter inicial: isso tem custo de rede e foi mantido explícito, sem presumir ETag como SHA-256. Evitar retries/revalidações redundantes e medir esse egress antes de calibrar produção.

`BlobStores` escolhe o provedor ativo para novas escritas e resolve cada leitura pelo `provider_id` persistido. `configuredRevisionService(additionalProviders)` é o ponto de composição server-side para adapters adicionais. Ao adicionar um adapter real, registrá-lo tanto nas entradas HTTP/worker quanto nas ferramentas administrativas; não colocar credenciais no cliente. Após cutover, metadados conservam a localização anterior e o leitor pode recorrer a ela se a primária falhar. O GC mantém objetos com localizações alternativas até a reconciliação administrativa.

Não há adapter R2/S3 operacional nesta entrega. O contrato é adequado para implementá-lo com o SDK oficial e credenciais server-side. Há testes com adapter de memória, arquivos locais e Supabase mock, incluindo duas localizações/provedores, interrupção, checksum inválido, retry, CAS e rollback. Isso não valida billing, ACL, multipart ou disponibilidade de S3/R2 reais.

## Preparação e dry-run

Nenhuma conta, bucket R2, DNS ou migração real foi criado. Antes de migrar: obter autorização do destino, cotas/custos/egress reais, provisionar bucket privado, executar testes de contrato do adapter e leitura autorizada, fazer backup verificado de banco e objetos e definir janela de rollback.

```sh
npm run history:migrate-provider -- --manifest /caminho-protegido/manifest.json --target novo-provider
```

Dry-run consulta metadados e escreve manifesto versionado local, sem copiar bytes nem mudar ponteiros. Caminho do manifesto deve ficar fora do repositório público. Contém hashes/IDs/locators, sem credenciais. Conferir soma de bytes, custo de cópia (inclusive hops/cache), espaço de pico e limites de API. Objetos físicos legados fora do modelo de blobs exigem inventário separado; o script não finge migrar todo o banco/Auth/Storage por uma flag.

## Cópia e verificação

Implementar um módulo local autorizado exportando `createBlobStore()`, usando o contrato da aplicação. O script aceita esse módulo exclusivamente na máquina administrativa, não por requisição pública:

```sh
npm run history:migrate-provider -- --manifest /caminho-protegido/manifest.json \
  --target novo-provider --adapter-module /caminho/adapter-aprovado.mjs \
  --execute --authorized-copy
```

Copia objeto imutável, verifica cada tamanho/checksum, registra localização alternativa e salva progresso. Retomar com o mesmo manifesto é idempotente. A origem permanece válida em falha. Não confiar em ETag multipart. Além dos hashes de todos os objetos, reconstruir amostras de estados completos/deltas e verificar seus hashes semânticos no ambiente de homologação. O contrato testa hashes de payload; a amostragem com o provedor real precisa ser executada antes do cutover.

## Cutover, concorrência e rollback

1. Registrar o adapter de destino nos backends e workers; manter ambos configurados para leitura.
2. Reexecutar dry-run/cópia para reconciliar blobs criados após o manifesto inicial. Controlar novas gravações por configuração do backend e rever reservas por recurso/provedor.
3. Fazer cutover **autorizado** das entradas verificadas usando `--authorized-cutover` junto à execução de cópia. Cada troca usa CAS de ID/generation/provider. Conflitos são listados e precisam de novo inventário; não forçar ponteiros.
4. Alterar `REVISION_BLOB_PROVIDER` apenas depois de a composição registrar o novo adapter. Testar novas gravações e leitura de objetos nos dois provedores. A configuração não cria um adapter ausente automaticamente.
5. Manter a origem durante a janela de rollback e backup. Para rollback de locators com a generation esperada, repetir com `--execute --rollback --authorized-cutover` (não exige credenciais do destino) e mudar a configuração ativa de novas gravações de volta. Objetos criados exclusivamente no destino durante a janela continuam exigindo leitura por esse adapter até reconciliação/cópia de volta.
6. Reconciliar todos os conflitos, novas gravações, backups e leases antes de encerrar a migração.

**Não existe exclusão automática da origem no script.** Ela exige autorização administrativa separada, comprovação de cópias/referências/backups e janela de manutenção. Reter uma localização alternativa impede GC prematuro, mas consome bytes nos dois provedores; contabilizar ambos. Locators mantêm IDs lógicos e hashes, sem reescrever documentos ou URLs virtuais.
