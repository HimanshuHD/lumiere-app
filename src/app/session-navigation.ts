import { setActiveAccount } from './account-runtime';
import { appBase, navigate } from './navigation';
import { clearOAuthReturn } from '@/infrastructure/browser/oauth-return';
import { cancelPageTransition } from '@/shared/transitions';

let account: string | undefined;
/** Auth invokes this before publishing its new identity. Reset URL before cache disposal notifies UI. */
export function applySessionAccount(next: string | undefined) {
  if (account !== next) cancelPageTransition();
  if (account && account !== next) {
    try { clearOAuthReturn(window.sessionStorage, appBase); } catch { /* No reusable intent. */ }
    navigate({kind:'view',view:'library'}, {replace:true, transition:false});
  }
  account = next;
  setActiveAccount(next);
}
