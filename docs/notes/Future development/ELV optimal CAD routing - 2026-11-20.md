# ELV optimal CAD routing — implemented decision

**Decision 2026-11-20:** after the LV implementation was merged, the system-first ELV mockup was approved for implementation. The engineer selects the system before source and destination; alternatives are constrained by that system's length/review rule, LV segregation and preferred containment.

The implementation reuses the bounded geometry engine with the same safety limits: no more than three alternatives, an adaptive grid capped at 60,000 cells, reusable typed arrays and no saved search grid. Shown walls remain hard obstacles; drawn LV cable routes are 0.3 m exclusion lines; matching ELV, data or fire-alarm containment is a preference rather than a hard requirement.

All five systems are eligible. ICT checks a 90 m permanent link; CCTV checks a 100 m PoE channel. Fire alarm, access control and PA are explicitly marked for loop resistance, voltage-drop or manufacturer review instead of using a false universal limit. Only the approved route is stored in metres and added to the ELV route schedule and plan/DXF outputs.

Future decisions remain manufacturer-specific limits, redundant/path-diverse routing and equipment-room destination rules. Those require separate approval.
