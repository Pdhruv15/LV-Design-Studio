# Containment segment inspector — decision — 2026-11-22

## Approved first release

- Implement the selected **Segment inspector** mockup for LV cable trays only.
- Check the tray runs in the currently open 2D CAD drawing; a building or level assignment is not required.
- Use the existing tray-route cable assignments and sizing rules. Do not infer or add ELV cables in this release.
- Calculate only while the tool is open. Do not run a background scan or save a route/spatial index.
- Bound one check to 256 drawn segments, 128 referenced routes and 2,048 cable instances per route.
- Allow direct application only when the recommendation is one tray tier. Multi-tier changes stay in the tray schedule so the drawing does not hide that design decision.

## Deferred

- ELV cable assignment, LV/ELV segregation and divider checks.
- Persistent coordination issue tracking and cross-level dashboards.
- Automatic checking after every CAD edit.
