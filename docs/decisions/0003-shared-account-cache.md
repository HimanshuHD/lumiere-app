# 0003: Lightweight shared account cache

Status: retained from #14, dependency injection added in #15.

Use immutable QueryCache snapshots, useSyncExternalStore and per-item MutationGate rather than adding
a state-management library. The app runtime creates one account store with an injected repository.
Requests deduplicate; generations/disposal reject stale work; confirmed mutations update snapshots;
failures retain confirmed data. Account changes clear caches and navigation. Synchronization is within
one app session, not cross-tab realtime. Catalog management has a distinct lazy query using the same
infrastructure; personal library membership filtering is preserved.
