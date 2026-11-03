# 0002: Persistence through ports and adapters

Status: adopted incrementally in #15.

Keep one application/repository, not microservices. Domain and service ports describe operations;
Supabase/browser adapters implement them. The SDK client and public environment setup are isolated.
Adapters return data/failures and never navigate, toast, or mutate feature caches. Application commands
coordinate successful writes with captured account state. UserDataRepository is injected and tested
without SDK/environment initialization. Generated schema types and complete response mappers remain
explicit follow-up work; existing casts are not described as generated contracts.
