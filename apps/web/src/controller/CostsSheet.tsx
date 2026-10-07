import { COSTS, RESOURCE_IDS } from '@hexa/engine';
import type { MessageKey } from '../i18n/index.js';
import { useI18n } from '../i18n/index.js';
import { ResourceIcon } from './ResourceIcon.js';

const ROWS: readonly { key: keyof typeof COSTS; label: MessageKey }[] = [
  { key: 'road', label: 'ctl.cost.road' },
  { key: 'settlement', label: 'ctl.cost.settlement' },
  { key: 'city', label: 'ctl.cost.city' },
  { key: 'devCard', label: 'ctl.cost.devCard' },
];

/** Tabla de costes de construcción, plegada por defecto para no ocupar pantalla. */
export function CostsSheet() {
  const { t } = useI18n();
  return (
    <details className="costs">
      <summary>{t('ctl.costs')}</summary>
      <ul>
        {ROWS.map(({ key, label }) => (
          <li key={key}>
            <span className="cost-name">{t(label)}</span>
            <span className="cost-icons">
              {RESOURCE_IDS.flatMap((r) =>
                Array.from({ length: COSTS[key][r] }, (_, i) => (
                  <ResourceIcon key={`${r}-${i}`} resource={r} size={20} />
                )),
              )}
            </span>
          </li>
        ))}
      </ul>
    </details>
  );
}
