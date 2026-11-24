import { ELV_SYSTEMS, type ElvSystem } from '../../elv/defaults';
import { devicesOf, ELV_DEVICES, reachM, type ElvDeviceType } from '../../elv/devices';

/** Names of the ELV systems and devices for the ribbon, kept apart from the ELV engine so the app's start-up does not
 * load it (Design CAD loads it with elvPlan.ts). */

export const SYSTEM_LABEL: Record<ElvSystem, string> = {
  'fire-alarm': 'Fire alarm', cctv: 'CCTV', 'access-control': 'Access control', ict: 'Data and Wi-Fi', 'public-address': 'Public address'
};
export const SYSTEMS = ELV_SYSTEMS.map((id) => ({ id, label: SYSTEM_LABEL[id] }));
export const devicesFor = (system: ElvSystem) => devicesOf(system);
export const deviceLabel = (t: ElvDeviceType) => ELV_DEVICES[t].label;
/** Whether Fill room can place this device: only devices whose coverage sets a spacing. */
export const canFill = (t: ElvDeviceType) => reachM(t) > 0;

export interface ElvPaletteItem { id: string; label: string; kind: { elv: ElvDeviceType }; symbol: { shape: string; text: string } }
const PICK: ElvDeviceType[] = ['smoke-detector', 'heat-detector', 'call-point', 'sounder', 'camera', 'card-reader', 'data-outlet', 'access-point', 'ceiling-speaker'];
export const ELV_PALETTE: ElvPaletteItem[] = PICK.map((t) => ({ id: t, label: ELV_DEVICES[t].label, kind: { elv: t }, symbol: ELV_DEVICES[t].symbol }));

/** The grid step Fill room places a device at: √2 × its radius, or its spacing (as fillPoints). 0: it cannot fill. */
export const fillSpacingM = (t: ElvDeviceType) => reachM(t) * Math.SQRT2;
/** The devices Fill room offers on its arrow: the palette's devices that have a spacing, with it. */
export const fillChoices = (): { type: ElvDeviceType; label: string; spacingM: number }[] =>
  ELV_PALETTE.filter((x) => canFill(x.kind.elv)).map((x) => ({ type: x.kind.elv, label: x.label, spacingM: fillSpacingM(x.kind.elv) }));
/** The systems Coverage offers on its arrow: those with a device that covers an area, a travel distance or a view. */
export const coverageSystems = (): { id: ElvSystem; label: string }[] => SYSTEMS.filter((s) => devicesOf(s.id).some((d) => !!d.coverage));
