# 0002: Persistence through ports and adapters

Status: adopted in #15.

Keep one application/repository, not microservices. Domain and service ports describe operations;
Supabase/browser adapters implement them. The SDK client and public environment setup are isolated.
Adapters return data/failures and never navigate, toast, or mutate feature caches. Application commands
coordinate successful writes with captured account state. UserDataRepository is injected and tested
without SDK/environment initialization. Application-schema types are generated from the migrated PostgreSQL catalog using
`npm run db:types`; CI rejects drift. Runtime mappers validate untrusted document, summary, reference
and progress responses. Platform auth/storage scaffolding is isolated from application migrations.
UI-facing commands use ServiceResult; lower-level rejecting services are normalized at command
boundaries. App composition injects ports; no feature/UI directly imports concrete adapters.
