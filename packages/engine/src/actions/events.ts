import type { HexId } from '../board/hex.js';
import type { EdgeId, VertexId } from '../board/topology.js';
import type { ResourceId } from '../board/types.js';
import type { ResourceCounts } from '../state/resources.js';
import type { DevCardId, PlayerId } from '../state/types.js';

/** Lo ocurrido, para animaciones y registro. No contiene información oculta de terceros. */
export type GameEvent =
  | { readonly type: 'SETTLEMENT_BUILT'; readonly player: PlayerId; readonly vertex: VertexId }
  | { readonly type: 'ROAD_BUILT'; readonly player: PlayerId; readonly edge: EdgeId }
  | { readonly type: 'CITY_BUILT'; readonly player: PlayerId; readonly vertex: VertexId }
  | {
      readonly type: 'RESOURCES_GAINED';
      readonly player: PlayerId;
      readonly resources: ResourceCounts;
      readonly reason: 'setup' | 'roll' | 'dev-card';
    }
  | { readonly type: 'TURN_STARTED'; readonly player: PlayerId; readonly number: number }
  | {
      readonly type: 'DICE_ROLLED';
      readonly player: PlayerId;
      readonly dice: readonly [number, number];
      readonly total: number;
    }
  | { readonly type: 'PRODUCTION_SHORTAGE'; readonly resource: ResourceId }
  | { readonly type: 'CARDS_DISCARDED'; readonly player: PlayerId; readonly count: number }
  | {
      readonly type: 'ROBBER_MOVED';
      readonly player: PlayerId;
      readonly hex: HexId;
      readonly victim: PlayerId | null;
    }
  | { readonly type: 'CARD_STOLEN'; readonly thief: PlayerId; readonly victim: PlayerId }
  | { readonly type: 'DEV_CARD_BOUGHT'; readonly player: PlayerId }
  | { readonly type: 'DEV_CARD_PLAYED'; readonly player: PlayerId; readonly card: DevCardId }
  | {
      readonly type: 'MONOPOLY_COLLECTED';
      readonly player: PlayerId;
      readonly resource: ResourceId;
      readonly total: number;
    }
  | {
      readonly type: 'BANK_TRADED';
      readonly player: PlayerId;
      readonly give: ResourceId;
      readonly giveCount: number;
      readonly want: ResourceId;
    };
