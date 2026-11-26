import type { RoomScope } from '../../model/roomScope';

/** All rooms like this: the rooms one run takes — this room, the rooms of its type on the level, or the whole level. */
export default function RoomScopeButtons({ scope, onScope, counts }: { scope: RoomScope; onScope: (s: RoomScope) => void; counts?: Record<RoomScope, number> }) {
  const items: [RoomScope, string][] = [['room', 'This room'], ['type', 'Same type'], ['level', 'Whole level']];
  return (
    <div className="cad-scope" role="radiogroup" aria-label="Rooms">
      {items.map(([id, label]) => (
        <button key={id} type="button" role="radio" aria-checked={scope === id} onClick={() => onScope(id)}>{label}{counts && id !== 'room' ? ` · ${counts[id]}` : ''}</button>
      ))}
    </div>
  );
}
