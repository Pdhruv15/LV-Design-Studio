# ELV optimal CAD routing — deferred decision

**Decision 2026-11-20:** ship and assess bounded optimal routing for LV first. ELV optimal routing is not part of the current implementation and needs a separate mockup and approval.

The LV geometry engine may be reused later, but ELV needs its own design rules before it is enabled: system segregation, permitted containment, maximum permanent-link or circuit lengths, equipment-room destinations and system-specific allowances. The future design should keep the same safety limits—no more than three alternatives, an adaptive grid capped at 60,000 cells, reusable typed arrays and no saved search grid—unless profiling supports a lower limit.

Before implementation, decide which ELV systems are eligible and whether the objective is shortest length, containment preference, segregation, redundancy, or a weighted combination. Keep the current manual ELV route workflow until that decision is approved.
