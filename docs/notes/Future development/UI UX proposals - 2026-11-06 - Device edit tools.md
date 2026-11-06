# UI / UX proposal — Device edit tools in Design CAD (2026-11-06)

Mockup: [cad-device-edit-mockup.html](../../mockups/cad-device-edit-mockup.html)

The user asked on 2026-11-06 for both device edit tools and core edit tools (Trim, Extend, Offset, Mirror, Fillet…), device tools first. Approved by the user on 2026-11-06 with the toolbar at the cursor, and built in v2.039 (`src/model/deviceEdit.ts`, `src/components/cad/DeviceToolbar.tsx`, `DeviceEditPanel.tsx`). The PDF / image underlay was rejected the same day ("opening PDF in our software is not required").

## Proposal

A new **Edit devices** group in Plan → Devices, after Copy to level, with three tools:

- **Select (SEL):** a window round devices.
  - Left to right selects what is fully inside. Right to left also selects what the window crosses.
  - Shift-click adds or removes one device. Esc clears the selection.
  - The side panel shows what is selected (by type and by circuit) and what can be done to it:
    - **Align in a row / in a column:** the devices take the average Y or X.
    - **Space equally:** the two outer devices stay where they are, and the rest are spread evenly along the line between them.
    - **Replace with:** another LV point type, or another ELV device of the same system.
    - **Circuit:** move the points to another circuit. The panel shows the point count after the change and warns above *Lighting points per circuit (max)* from the Rules sheet. A type that does not suit the circuit (a socket on a lighting circuit) is warned, not blocked.
    - **Move, Copy, Delete:** for the whole selection; today they work on one device at a time.
- **Array on line (ARL):** click the start and end of a line.
  - Choose the device and circuit, then the number of devices or their spacing.
  - Ends: half a spacing from each end (corridor lights) or on the ends.
  - A preview shows on the plan, then **Place N**.
- **Match (MA):** click the device to copy from, then each device to change.
  - It copies the circuit (LV) or system (ELV), and optionally the device type. Enter or Esc stops.

**Toolbar at the cursor** (the user's idea, 2026-11-06). When you click a device or drag a window, a small toolbar opens just above what is picked; near the top edge it opens below instead. It hides while a window is dragged, and Esc or a click elsewhere closes it. Right-clicking a device gives the same options as a menu at the cursor. What it offers depends on what is picked:

| Picked | Toolbar |
|---|---|
| Light | Array on line, Replace ▾, Circuit ▾, Match, Move, Copy, Delete |
| Socket or other LV point | Replace ▾, Circuit ▾, Match, Move, Copy, Delete |
| ELV device | Replace ▾ (same system), Coverage, Match, Move, Copy, Delete |
| Board | Rename, Circuits…, Move, Delete |
| Several | Align row, Align column, Space equally (3 or more), then the edits they all have; a mixed set adds Filter ▾ (Lights only…) |

Replace and Circuit open a short list at the toolbar; Circuit shows each circuit's point count before and after the change, with ⚠ above the limit. The side panel stays for properties, warnings and the Array on line settings.

Each change is one undo step and updates the circuit point counts and the load schedule, as Add device does. The command line has SEL, ARL, MA, ALIGN and SPACE.

## Not in this version

- Rotating device symbols: they are drawn upright today.
- Window selection of drawn lines, trays and routes: this comes with the core edit tools, proposed next.

## Decisions for the user

1. Screen as in the mockup, with the toolbar at the cursor and the right-click menu: **approved** (2026-11-06).
2. Replace across systems (for example an ELV device into an LV point) is not allowed. Not answered; built as proposed. Still open.
3. Over the point limit: built as **warn only** (the circuit list marks ⚠, the message says so). Not answered; still open.
4. Built beyond the mockup: a board's **Circuits** picks every device on its circuits on the level (the app has no board page to open from CAD); **Rename** changes the board's name, not its ID.
