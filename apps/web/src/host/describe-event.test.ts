import { describe, expect, it } from 'vitest';
import type { GameEvent, TradeOffer } from '@hexa/engine';
import { LOCALES } from '@hexa/theme';
import { translate } from '../i18n/index.js';
import { describeEvent, formatResources } from './describe-event.js';

const none = { r1: 0, r2: 0, r3: 0, r4: 0, r5: 0 };
const offer: TradeOffer = {
  id: 1,
  from: 'p0',
  to: null,
  give: none,
  want: none,
  accepted: [],
  rejected: [],
  counters: [],
};

/** Un evento de muestra de cada tipo: el `Record` obliga a cubrir todos los del motor. */
const samples: Record<GameEvent['type'], GameEvent[]> = {
  SETTLEMENT_BUILT: [{ type: 'SETTLEMENT_BUILT', player: 'p0', vertex: 'v1' }],
  ROAD_BUILT: [{ type: 'ROAD_BUILT', player: 'p0', edge: 'e1' }],
  CITY_BUILT: [{ type: 'CITY_BUILT', player: 'p0', vertex: 'v1' }],
  RESOURCES_GAINED: [
    {
      type: 'RESOURCES_GAINED',
      player: 'p0',
      resources: { ...none, r1: 2, r3: 1 },
      reason: 'roll',
    },
  ],
  TURN_STARTED: [{ type: 'TURN_STARTED', player: 'p1', number: 4 }],
  DICE_ROLLED: [{ type: 'DICE_ROLLED', player: 'p0', dice: [3, 4], total: 7 }],
  PRODUCTION_SHORTAGE: [{ type: 'PRODUCTION_SHORTAGE', resource: 'r2' }],
  CARDS_DISCARDED: [{ type: 'CARDS_DISCARDED', player: 'p1', count: 4 }],
  ROBBER_MOVED: [
    { type: 'ROBBER_MOVED', player: 'p0', hex: 'h0,0', victim: null },
    { type: 'ROBBER_MOVED', player: 'p0', hex: 'h0,0', victim: 'p1' },
  ],
  CARD_STOLEN: [{ type: 'CARD_STOLEN', thief: 'p0', victim: 'p1' }],
  DEV_CARD_BOUGHT: [{ type: 'DEV_CARD_BOUGHT', player: 'p0' }],
  DEV_CARD_PLAYED: [{ type: 'DEV_CARD_PLAYED', player: 'p0', card: 'army' }],
  MONOPOLY_COLLECTED: [{ type: 'MONOPOLY_COLLECTED', player: 'p0', resource: 'r4', total: 5 }],
  BANK_TRADED: [{ type: 'BANK_TRADED', player: 'p0', give: 'r1', giveCount: 4, want: 'r5' }],
  TRADE_OFFERED: [{ type: 'TRADE_OFFERED', offer }],
  TRADE_ACCEPTED: [{ type: 'TRADE_ACCEPTED', player: 'p1', offerId: 1 }],
  TRADE_REJECTED: [{ type: 'TRADE_REJECTED', player: 'p1', offerId: 1 }],
  TRADE_CANCELLED: [{ type: 'TRADE_CANCELLED', offerId: 1 }],
  TRADE_COMPLETED: [{ type: 'TRADE_COMPLETED', offerId: 1, from: 'p0', with: 'p1' }],
  AWARD_CHANGED: [
    { type: 'AWARD_CHANGED', award: 'longestRoad', holder: 'p0', previous: null },
    { type: 'AWARD_CHANGED', award: 'largestArmy', holder: null, previous: 'p1' },
  ],
  GAME_WON: [{ type: 'GAME_WON', player: 'p0', points: 10 }],
};

const names: Record<string, string> = { p0: 'Ana', p1: 'Luis' };

describe('describeEvent', () => {
  it('describe todos los tipos de evento en los dos idiomas, sin marcadores sin resolver', () => {
    for (const locale of LOCALES) {
      const ctx = {
        locale,
        t: (key: Parameters<typeof translate>[1], params?: Parameters<typeof translate>[2]) =>
          translate(locale, key, params),
        name: (id: string) => names[id] ?? id,
      };
      for (const events of Object.values(samples)) {
        for (const event of events) {
          const text = describeEvent(event, ctx);
          expect(text.length, event.type).toBeGreaterThan(0);
          expect(text, `${locale} ${event.type}`).not.toMatch(/[{}]/);
          expect(text).not.toContain('event.');
        }
      }
    }
  });

  it('incluye los nombres de los jugadores y las cantidades', () => {
    const ctx = {
      locale: 'es' as const,
      t: (key: Parameters<typeof translate>[1], params?: Parameters<typeof translate>[2]) =>
        translate('es', key, params),
      name: (id: string) => names[id] ?? id,
    };
    expect(describeEvent({ type: 'DICE_ROLLED', player: 'p0', dice: [3, 4], total: 7 }, ctx)).toBe(
      'Ana saca 7 (3 + 4)',
    );
    expect(
      describeEvent(
        { type: 'BANK_TRADED', player: 'p1', give: 'r1', giveCount: 4, want: 'r5' },
        ctx,
      ),
    ).toBe('Luis cambia 4 de Madera por 1 de Mineral con el banco');
  });

  it('formatResources solo lista lo que hay', () => {
    expect(formatResources({ ...none, r1: 2, r3: 1 }, 'es')).toBe('2× Madera, 1× Lana');
    expect(formatResources(none, 'es')).toBe('');
  });
});
