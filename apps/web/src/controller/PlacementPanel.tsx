import { useState } from 'react';
import { createPortal } from 'react-dom';
import type { Action, PlayerView } from '@hexa/engine';
import type { PreviewTarget } from '@hexa/protocol';
import { playerColor } from '@hexa/theme';
import { useI18n } from '../i18n/index.js';
import type { MessageKey } from '../i18n/index.js';
import type { PlayerInfo } from '../host/players.js';
import { legalEdges, legalVertices, robberOptions } from './legal.js';
import { useSender } from './use-send.js';
import { ZoomableBoard } from './ZoomableBoard.js';

export type PlacementKind = 'settlement' | 'city' | 'road' | 'robber';

const HELP: Record<PlacementKind, MessageKey> = {
  settlement: 'ctl.place.settlement',
  city: 'ctl.place.city',
  road: 'ctl.place.road',
  robber: 'ctl.place.robber',
};

/**
 * Elegir un sitio del tablero con confirmación en dos pasos: tocar para marcar (y enseñarlo en
 * la pantalla principal) y después confirmar. Solo se pueden tocar las posiciones legales.
 */
export function PlacementPanel({
  view,
  kind,
  infos,
  remaining,
  boardSlot,
  onCancel,
  onDone,
}: {
  view: PlayerView;
  kind: PlacementKind;
  infos: ReadonlyMap<string, PlayerInfo>;
  /** Caminos gratis que quedan por colocar (carta de caminos). */
  remaining?: number | null;
  /**
   * Dónde dibujar el tablero. Sin valor, dentro del propio panel; con un elemento (pantalla ancha),
   * en ese hueco, junto al mando; con `null`, todavía no está disponible.
   */
  boardSlot?: HTMLElement | null | undefined;
  /** Si se omite, la elección es obligatoria y no hay botón de cancelar. */
  onCancel?: () => void;
  onDone?: () => void;
}) {
  const { t, locale } = useI18n();
  const { send, preview, busy, problem, clearProblem } = useSender();
  const [selected, setSelected] = useState<PreviewTarget | null>(null);
  const [victim, setVictim] = useState<string | null | undefined>(undefined);

  const legal = view.legalActions;
  const you = view.you;
  if (!you) return null;
  const color = infos.get(you.id)?.color ?? 'c1';

  const vertices =
    kind === 'settlement'
      ? legalVertices(legal, 'BUILD_SETTLEMENT')
      : kind === 'city'
        ? legalVertices(legal, 'BUILD_CITY')
        : undefined;
  const edges = kind === 'road' ? legalEdges(legal) : undefined;
  const robber = kind === 'robber' ? robberOptions(legal) : undefined;
  const hexes = robber ? new Set(robber.keys()) : undefined;
  const victims =
    selected && robber ? (robber.get(selected.id) ?? []).filter((v) => v !== null) : [];

  const pick = (target: PreviewTarget) => {
    clearProblem();
    setSelected(target);
    preview(target);
    if (robber) {
      const options = robber.get(target.id) ?? [];
      // Con una sola víctima posible (o ninguna) no hay nada que elegir.
      setVictim(options.length === 1 ? (options[0] ?? null) : undefined);
    }
  };

  const clear = () => {
    setSelected(null);
    setVictim(undefined);
    preview(null);
  };

  const toAction = (): Action | null => {
    if (!selected) return null;
    switch (kind) {
      case 'settlement':
        return { type: 'BUILD_SETTLEMENT', vertex: selected.id };
      case 'city':
        return { type: 'BUILD_CITY', vertex: selected.id };
      case 'road':
        return { type: 'BUILD_ROAD', edge: selected.id };
      case 'robber':
        return victim === undefined ? null : { type: 'MOVE_ROBBER', hex: selected.id, victim };
    }
  };

  const action = toAction();
  const confirm = async () => {
    if (!action) return;
    if (await send(action)) {
      clear();
      onDone?.();
    }
  };

  const boardElement = (
    <ZoomableBoard
      board={view.board}
      buildings={view.buildings}
      roads={view.roads}
      robber={view.robber}
      colorOf={(id) => infos.get(id)?.color ?? 'c1'}
      locale={locale}
      label={t('app.name')}
      interaction={{
        ...(vertices ? { vertices } : {}),
        ...(edges ? { edges } : {}),
        ...(hexes ? { hexes } : {}),
        selected,
        color,
        onPick: pick,
      }}
    />
  );

  return (
    <section className="placement">
      <p className="instruction">
        {kind === 'road' && remaining != null
          ? t('ctl.place.roadFree', { n: remaining })
          : t(HELP[kind])}
      </p>
      {boardSlot === undefined
        ? boardElement
        : boardSlot
          ? createPortal(boardElement, boardSlot)
          : null}

      {victims.length > 1 && (
        <div className="victims" role="group" aria-label={t('ctl.victim.choose')}>
          <p className="muted">{t('ctl.victim.choose')}</p>
          {victims.map((id) => {
            const info = infos.get(id ?? '');
            const swatch = playerColor(info?.color ?? 'c1');
            return (
              <button
                key={id}
                type="button"
                className={victim === id ? 'btn selected' : 'btn'}
                aria-pressed={victim === id}
                onClick={() => setVictim(id)}
              >
                <span
                  className="swatch"
                  style={{ background: swatch.fill, borderColor: swatch.stroke }}
                />
                {info?.name ?? id}
              </button>
            );
          })}
        </div>
      )}
      {kind === 'robber' && selected && victims.length === 0 && (
        <p className="muted">{t('ctl.victim.none')}</p>
      )}

      {problem && (
        <p className="error" role="alert">
          {problem}
        </p>
      )}
      <div className="panel-actions">
        {onCancel && (
          <button
            type="button"
            className="btn"
            onClick={() => {
              clear();
              onCancel();
            }}
          >
            {t('ctl.cancel')}
          </button>
        )}
        <button
          type="button"
          className="btn btn-primary"
          disabled={!action || busy}
          onClick={() => void confirm()}
        >
          {t('ctl.confirm')}
        </button>
      </div>
    </section>
  );
}
