import type { EdgeId, VertexId } from '../board/topology.js';
import type { ResourceId } from '../board/types.js';
import type { ResourceCounts } from '../state/resources.js';
import type { PlayerId } from '../state/types.js';

/** Lo ocurrido, para animaciones y registro. No contiene información oculta de terceros. */
export type GameEvent =
  | { readonly type: 'SETTLEMENT_BUILT'; readonly player: PlayerId; readonly vertex: VertexId }
  | { readonly type: 'ROAD_BUILT'; readonly player: PlayerId; readonly edge: EdgeId }
  | {
      readonly type: 'RESOURCES_GAINED';
      readonly player: PlayerId;
      readonly resources: ResourceCounts;
      readonly reason: 'setup' | 'roll';
    }
  | { readonly type: 'TURN_STARTED'; readonly player: PlayerId; readonly number: number }
  | {
      readonly type: 'DICE_ROLLED';
      readonly player: PlayerId;
      readonly dice: readonly [number, number];
      readonly total: number;
    }
  | { readonly type: 'PRODUCTION_SHORTAGE'; readonly resource: ResourceId };
