import { PLAYER_COLORS } from '@hexa/protocol';
import type { PlayerColor } from '@hexa/protocol';
import { playerColors } from '@hexa/theme';
import { useI18n } from '../i18n/index.js';
import type { MessageKey } from '../i18n/index.js';

const LABELS: Record<PlayerColor, MessageKey> = {
  c1: 'color.c1',
  c2: 'color.c2',
  c3: 'color.c3',
  c4: 'color.c4',
};

/** Selector de color de jugador (botones de opción accesibles); los colores ocupados se bloquean. */
export function ColorPicker({
  legend,
  value,
  onChange,
  taken,
}: {
  legend: string;
  value: PlayerColor | null;
  onChange: (color: PlayerColor) => void;
  taken?: ReadonlySet<string> | undefined;
}) {
  const { t } = useI18n();
  return (
    <fieldset className="color-picker">
      <legend>{legend}</legend>
      {PLAYER_COLORS.map((c) => {
        const blocked = taken?.has(c) ?? false;
        return (
          <label key={c} className={value === c ? 'color-option selected' : 'color-option'}>
            <input
              type="radio"
              name="color"
              value={c}
              checked={value === c}
              disabled={blocked}
              onChange={() => onChange(c)}
            />
            <span
              className={blocked ? 'swatch swatch-lg taken' : 'swatch swatch-lg'}
              style={{ background: playerColors[c].fill, borderColor: playerColors[c].stroke }}
            />
            <span className="sr-only">{t(LABELS[c])}</span>
          </label>
        );
      })}
    </fieldset>
  );
}
