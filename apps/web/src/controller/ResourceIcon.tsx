import { glyphs, resourceName, terrainColors } from '@hexa/theme';
import type { ResourceId } from '@hexa/engine';
import { useI18n } from '../i18n/index.js';

/** Icono de recurso con los colores del tema. */
export function ResourceIcon({ resource, size = 22 }: { resource: ResourceId; size?: number }) {
  const colors = terrainColors[resource];
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} aria-hidden="true" className="res-icon">
      <path d={glyphs[resource]} fill={colors.fill} stroke={colors.stroke} strokeWidth="1.2" />
    </svg>
  );
}

/** Botón grande para elegir un recurso: icono, nombre y una nota opcional (cantidad, tarifa…). */
export function ResourceButton({
  resource,
  note,
  selected = false,
  disabled = false,
  onClick,
}: {
  resource: ResourceId;
  note?: string | undefined;
  selected?: boolean | undefined;
  disabled?: boolean | undefined;
  onClick: () => void;
}) {
  const { locale } = useI18n();
  return (
    <button
      type="button"
      className={selected ? 'res-btn selected' : 'res-btn'}
      aria-pressed={selected}
      disabled={disabled}
      onClick={onClick}
    >
      <ResourceIcon resource={resource} size={28} />
      <span className="res-name">{resourceName(locale, resource)}</span>
      {note !== undefined && <span className="res-note">{note}</span>}
    </button>
  );
}
