import type { PlayerView } from '@hexa/engine';
import type { MessageKey, Params } from '../i18n/index.js';

/** Frase que resume qué está pasando ahora mismo en la partida. */
export function phaseText(
  view: PlayerView,
  name: (playerId: string) => string,
  t: (key: MessageKey, params?: Params) => string,
): string {
  const player = name(view.turn.player);
  const { phase } = view;
  switch (phase.type) {
    case 'setup':
      return t(phase.step === 'settlement' ? 'phase.setup.settlement' : 'phase.setup.road', {
        player,
      });
    case 'roll':
      return t('phase.roll', { player });
    case 'discard':
      return t('phase.discard', { players: Object.keys(phase.owed).map(name).join(', ') });
    case 'robber':
      return t('phase.robber', { player });
    case 'roadBuilding':
      return t('phase.roadBuilding', { player });
    case 'main':
      return t('phase.main', { player });
    case 'ended':
      return t('phase.ended');
  }
}
