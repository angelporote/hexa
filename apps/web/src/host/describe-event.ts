import { RESOURCE_IDS } from '@hexa/engine';
import type { GameEvent, ResourceCounts } from '@hexa/engine';
import { devCardName, resourceName } from '@hexa/theme';
import type { Locale } from '@hexa/theme';
import type { MessageKey, Params } from '../i18n/index.js';

export interface DescribeContext {
  readonly locale: Locale;
  readonly t: (key: MessageKey, params?: Params) => string;
  readonly name: (playerId: string) => string;
}

/** «2× Madera, 1× Lana»: solo los recursos con cantidad. */
export function formatResources(counts: ResourceCounts, locale: Locale): string {
  return RESOURCE_IDS.filter((r) => counts[r] > 0)
    .map((r) => `${counts[r]}× ${resourceName(locale, r)}`)
    .join(', ');
}

/** Frase del registro de partida para un evento; todo el texto sale de i18n y del tema. */
export function describeEvent(event: GameEvent, ctx: DescribeContext): string {
  const { t, locale, name } = ctx;
  switch (event.type) {
    case 'SETTLEMENT_BUILT':
    case 'ROAD_BUILT':
    case 'CITY_BUILT':
      return t(`event.${event.type}`, { player: name(event.player) });
    case 'RESOURCES_GAINED':
      return t('event.RESOURCES_GAINED', {
        player: name(event.player),
        resources: formatResources(event.resources, locale),
      });
    case 'TURN_STARTED':
      return t('event.TURN_STARTED', { number: event.number, player: name(event.player) });
    case 'DICE_ROLLED':
      return t('event.DICE_ROLLED', {
        player: name(event.player),
        total: event.total,
        a: event.dice[0],
        b: event.dice[1],
      });
    case 'PRODUCTION_SHORTAGE':
      return t('event.PRODUCTION_SHORTAGE', { resource: resourceName(locale, event.resource) });
    case 'CARDS_DISCARDED':
      return t('event.CARDS_DISCARDED', { player: name(event.player), count: event.count });
    case 'ROBBER_MOVED':
      return event.victim === null
        ? t('event.ROBBER_MOVED', { player: name(event.player) })
        : t('event.ROBBER_MOVED_VICTIM', {
            player: name(event.player),
            victim: name(event.victim),
          });
    case 'CARD_STOLEN':
      return t('event.CARD_STOLEN', { thief: name(event.thief), victim: name(event.victim) });
    case 'DEV_CARD_BOUGHT':
      return t('event.DEV_CARD_BOUGHT', { player: name(event.player) });
    case 'DEV_CARD_PLAYED':
      return t('event.DEV_CARD_PLAYED', {
        player: name(event.player),
        card: devCardName(locale, event.card),
      });
    case 'MONOPOLY_COLLECTED':
      return t('event.MONOPOLY_COLLECTED', {
        player: name(event.player),
        total: event.total,
        resource: resourceName(locale, event.resource),
      });
    case 'BANK_TRADED':
      return t('event.BANK_TRADED', {
        player: name(event.player),
        count: event.giveCount,
        give: resourceName(locale, event.give),
        want: resourceName(locale, event.want),
      });
    case 'TRADE_OFFERED':
      return t('event.TRADE_OFFERED', { player: name(event.offer.from) });
    case 'TRADE_ACCEPTED':
    case 'TRADE_REJECTED':
      return t(`event.${event.type}`, { player: name(event.player) });
    case 'TRADE_CANCELLED':
      return t('event.TRADE_CANCELLED');
    case 'TRADE_COMPLETED':
      return t('event.TRADE_COMPLETED', { player: name(event.from), partner: name(event.with) });
    case 'AWARD_CHANGED':
      return event.holder === null
        ? t(`event.AWARD_CHANGED.vacant.${event.award}`)
        : t(`event.AWARD_CHANGED.${event.award}`, { holder: name(event.holder) });
    case 'GAME_WON':
      return t('event.GAME_WON', { player: name(event.player), points: event.points });
  }
}
