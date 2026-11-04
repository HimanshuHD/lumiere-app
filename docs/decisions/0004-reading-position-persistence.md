# 0004: Typed format positions and durable pending saves

Status: retained from #13; contracts moved to domain in #15.

TXT stores chapter plus chapter-relative progress; PDF stores exact page and fit/manual view; EPUB
stores CFI plus approximate completion. A coordinator owns restoration, debounce, serialized saves,
local pending entries and revision conflicts. Engines emit typed positions and do not persist them.
Network writes never determine whether local pending state survives termination. Account-bound replay
and explicit conflict retry remain intact. Higher page/percentage is not a newer action: intentional
backwards reading is valid. PDF, EPUB and TXT controllers emit typed position events to the session controller.
The app runtime injects repository and pending-storage ports and disposes account stores on session changes.
