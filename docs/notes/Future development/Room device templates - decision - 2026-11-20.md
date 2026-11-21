# Room device templates — decision — 2026-11-20

## Approved first release

- Workflow: **Room preview**. Select one outlined room, inspect ghost devices, then approve or cancel.
- Templates: Office, Meeting room and Bedroom.
- Scope: LV + ELV, LV only or ELV only.
- LV outputs: lumen-method lights and twin sockets, with separate lighting and power circuits.
- ELV outputs: data outlets, Wi-Fi access points and smoke detectors through the ELV module boundary.
- Approval may replace only those template-managed device types already inside the selected room.

## Performance and storage limits

- Only the selected room and selected service scope are calculated.
- The preview has fixed budgets: 32 lights, 8 twin sockets and 24 ELV devices; 64 points total.
- Lighting stops point allocation at its preview budget while retaining the full calculated requirement and warning.
- ELV coverage fill accepts a maximum-point guard.
- Preview arrays are session-only. No grid, rejected option or template metadata is saved; approved devices use the existing `lvPoints` and `elvDevices` stores.

## Deferred

- Batch apply to many rooms.
- Thermostats, room controls or unsupported device classes.
- Automatic containment/riser assignment from the room template.
- User-authored templates and custom rule libraries.
