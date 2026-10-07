import { LOCALES } from '@hexa/theme';
import { useI18n } from '../i18n/index.js';

export function LanguageSwitch() {
  const { locale, setLocale, t } = useI18n();
  return (
    <div className="lang" role="group" aria-label={t('common.language')}>
      {LOCALES.map((l) => (
        <button
          key={l}
          type="button"
          className={l === locale ? 'lang-btn active' : 'lang-btn'}
          aria-pressed={l === locale}
          onClick={() => setLocale(l)}
        >
          {l.toUpperCase()}
        </button>
      ))}
    </div>
  );
}
