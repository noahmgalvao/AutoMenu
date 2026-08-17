# AutoMenu AI

AutoMenu agora usa `Supabase Auth + Postgres + Storage` como fonte principal de dados.

## Stack

- `Vite + React + TypeScript`
- `@supabase/supabase-js`
- `Supabase Auth`
- `Supabase Postgres`
- `Supabase Storage`
- `Gemini` no frontend

## Arquitetura implementada

- `profiles`: perfil do usuário autenticado
- `workspaces`: isolamento por negócio
- `workspace_members`: membership e RLS
- `catalog_categories`: categorias persistidas
- `catalog_products`: catálogo mestre
- `assets`: registro único de arquivos
- `menus`: cabeçalho do cardápio
- `menu_versions`: snapshots/versionamento do editor
- `templates`: templates do sistema e do workspace
- `template_versions`: versão atual do template salvo
- `ai_import_jobs`: auditoria da importação por IA

Tudo é privado por workspace. Os buckets criados são:

- `product-images`
- `menu-assets`
- `ai-imports`

## Setup

1. Instale dependências:
   `npm install`
2. Copie `.env.example` para `.env.local`
3. Preencha:
   - `VITE_SUPABASE_URL`
   - `VITE_SUPABASE_PUBLISHABLE_KEY`
   - `VITE_GEMINI_API_KEY`
4. Aplique a migration em `supabase/migrations/20260414183000_initial_automenu_schema.sql`
5. Rode:
   `npm run dev`

## Migration

A migration cria:

- tabelas
- enums
- índices
- triggers de `updated_at`
- trigger de onboarding em `auth.users`
- RLS
- buckets privados
- policies do Storage
- seed dos templates do sistema

Se for aplicar manualmente no painel do Supabase, rode o arquivo SQL inteiro no SQL Editor.

## Fluxo atual do app

- login/signup via Supabase Auth
- onboarding automático cria `profile`, `workspace` e `workspace_member(owner)`
- estado antigo do `localStorage` é importado uma única vez no primeiro load
- catálogo, templates e estilo passam a salvar no banco
- uploads de imagens passam pelo Supabase Storage
- cada autosave cria um `menu_version` com `editor_state` e `render_snapshot`
- importações por IA geram `ai_import_jobs`

## Observação

A chave do Gemini continua no frontend por decisão de produto. Isso funciona, mas é menos seguro do que mover a chamada para backend/edge function.
