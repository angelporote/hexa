import type { HexId } from '../board/hex.js';
import type { EdgeId, VertexId } from '../board/topology.js';
import type { ResourceId } from '../board/types.js';
import type { ResourceCounts } from '../state/resources.js';
import type { PlayerId } from '../state/types.js';

/** Intenciones que un jugador puede enviar. El motor decide si son legales. */
export type Action =
  | { readonly type: 'ROLL' }
  | { readonly type: 'BUILD_ROAD'; readonly edge: EdgeId }
  | { readonly type: 'BUILD_SETTLEMENT'; readonly vertex: VertexId }
  | { readonly type: 'BUILD_CITY'; readonly vertex: VertexId }
  | { readonly type: 'BUY_DEV_CARD' }
  | { readonly type: 'PLAY_ARMY' }
  | { readonly type: 'PLAY_ROADS' }
  | { readonly type: 'PLAY_PLENTY'; readonly resources: readonly [ResourceId, ResourceId] }
  | { readonly type: 'PLAY_MONOPOLY'; readonly resource: ResourceId }
  | { readonly type: 'DISCARD'; readonly resources: ResourceCounts }
  | { readonly type: 'MOVE_ROBBER'; readonly hex: HexId; readonly victim: PlayerId | null }
  | { readonly type: 'BANK_TRADE'; readonly give: ResourceId; readonly want: ResourceId }
  | {
      readonly type: 'OFFER_TRADE';
      readonly to: readonly PlayerId[] | null;
      readonly give: ResourceCounts;
      readonly want: ResourceCounts;
    }
  | { readonly type: 'ACCEPT_TRADE'; readonly offerId: number }
  | { readonly type: 'REJECT_TRADE'; readonly offerId: number }
  | { readonly type: 'CANCEL_TRADE'; readonly offerId: number }
  | {
      readonly type: 'COUNTER_TRADE';
      readonly offerId: number;
      readonly give: ResourceCounts;
      readonly want: ResourceCounts;
    }
  | { readonly type: 'CONFIRM_TRADE'; readonly offerId: number; readonly with: PlayerId }
  | { readonly type: 'CONFIRM_COUNTER'; readonly offerId: number; readonly with: PlayerId }
  | { readonly type: 'END_TURN' };

export type ActionType = Action['type'];
