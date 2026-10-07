import { useI18n } from '../i18n/index.js';
import { getSoundPlayer, useMuted } from '../sound/store.js';

/** Botón para activar o silenciar los sonidos; la preferencia se recuerda entre visitas. */
export function SoundToggle() {
  const { t } = useI18n();
  const [muted, setMuted] = useMuted();

  const toggle = () => {
    const next = !muted;
    setMuted(next);
    if (!next) {
      // Un toque es el gesto que permite el audio; suena un aviso corto para confirmarlo.
      const player = getSoundPlayer();
      player.unlock();
      player.play('gain');
    }
  };

  return (
    <button
      type="button"
      className="btn btn-icon sound-toggle"
      aria-pressed={!muted}
      aria-label={t('sound.toggle')}
      title={muted ? t('sound.off') : t('sound.on')}
      onClick={toggle}
    >
      <svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true" focusable="false">
        <path d="M3 9v6h4l5 4V5L7 9H3z" fill="currentColor" />
        {muted ? (
          <path
            d="M16 9l6 6M22 9l-6 6"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
          />
        ) : (
          <path
            d="M15.5 8.5a5 5 0 0 1 0 7M18 6a8.5 8.5 0 0 1 0 12"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
          />
        )}
      </svg>
    </button>
  );
}
