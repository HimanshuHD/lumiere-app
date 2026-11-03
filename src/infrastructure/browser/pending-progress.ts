import type { PendingStorage } from '@/domain/progress';
export function browserStorage(userId: string): PendingStorage {
  const prefix = `lumiere:reading-position:v1:${userId}:`;
  return {
    read: id => JSON.parse(localStorage.getItem(prefix + id) || 'null'),
    write: (id, pending) => localStorage.setItem(prefix + id, JSON.stringify(pending)),
    remove: (id, mutationId) => {
      const saved = JSON.parse(localStorage.getItem(prefix + id) || 'null');
      if (saved?.mutationId === mutationId) localStorage.removeItem(prefix + id);
    },
    documentIds: () => Object.keys(localStorage).filter(key => key.startsWith(prefix)).map(key => key.slice(prefix.length)),
  };
}

