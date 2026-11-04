# 0001: Document visibility and collection ownership

Status: retained from security/lifecycle/demo fixes.

User uploads can be private or shared and retain an owner. Canonical catalog imports are ownerless
and shared; personal membership controls library inclusion, not canonical ownership. Generated demo
stories are ownerless shared TXT and require no catalog membership. Legacy unowned records stay
quarantined pending privileged recovery. Backend constraints/RLS and privileged functions enforce
these properties; frontend checks only explain availability. Do not broaden policies during refactors.
