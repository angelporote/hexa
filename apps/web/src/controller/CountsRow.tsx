import { RESOURCE_IDS } from '@hexa/engine';
import type { ResourceCounts } from '@hexa/engine';
import { resourceName } from '@hexa/theme';
import { useI18n } from '../i18n/index.js';
import { ResourceIcon } from './ResourceIcon.js';

/** Fila compacta de cartas: un icono con su cantidad por cada recurso presente. */
export function CountsRow({ counts, size = 22 }: { counts: ResourceCounts; size?: number }) {
  const { locale } = useI18n();
  const present = RESOURCE_IDS.filter((r) => counts[r] > 0);
  if (present.length === 0) return <span className="counts-row empty">—</span>;
  return (
    <span className="counts-row">
      {present.map((r) => (
        <span key={r} className="counts-item" title={`${resourceName(locale, r)} ×${counts[r]}`}>
          <ResourceIcon resource={r} size={size} />
          <b>×{counts[r]}</b>
          <span className="sr-only">{resourceName(locale, r)}</span>
        </span>
      ))}
    </span>
  );
}
