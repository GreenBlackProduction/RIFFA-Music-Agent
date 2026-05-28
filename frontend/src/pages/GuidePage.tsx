import { useTranslation } from "react-i18next";
import "./GuidePage.css";

export function GuidePage() {
  const { i18n } = useTranslation();
  const isEN = (i18n.resolvedLanguage || i18n.language || "ru").startsWith("en");

  return (
    <div className="guide-page">
      <div className="top-meta">
        <div className="breadcrumb">
          <b>{isEN ? "manual" : "руководство"}</b>
        </div>
        <div>{isEN ? "8 tools · practical manual" : "8 инструментов · практическое руководство"}</div>
      </div>

      <h1 className="h-page">
        {isEN
          ? <>RIFFA Studio <em>user manual</em>.</>
          : <>Руководство по применению <em>RIFFA Studio</em>.</>}
      </h1>
      <p className="h-lead">
        {isEN
          ? "Eight tools — from a full song with vocals to a single sound effect. Each creation takes 20–60 seconds. Here is a step-by-step guide for each."
          : "Восемь инструментов — от полноценной песни с вокалом до единственного звукового эффекта. Каждое создание занимает 20–60 секунд. Здесь — пошаговые инструкции к каждому."}
      </p>

      {/* ─── 01 · Создать песню ─── */}
      <div className="h-section">
        <div className="tag"><span className="num">01</span> · {isEN ? "song" : "песня"}</div>
        <h2>{isEN ? "Create a song" : "Создать песню"}</h2>
      </div>
      <div className="guide-article">
        <div className="guide-cols">
          <div className="guide-text">
            <p className="guide-lead-text">
              {isEN
                ? "The main tool. RIFFA writes lyrics and produces music together — you get a full track with vocals in about 3-5 minutes."
                : "Главный инструмент. RIFFA сразу пишет текст и создаёт музыку — получаешь полноценный трек с вокалом примерно за 3-5 минут."}
            </p>

            <div className="guide-steps">
              <div className="guide-step">
                <span className="guide-step-num">1</span>
                <div>
                  <strong>{isEN ? "Open the Studio" : "Открой Студию"}</strong>
                  <p>{isEN ? "On the Studio page click the \"Create a song\" tile — the main module. The track builder opens." : "На странице Студии нажми на плитку «Создать песню» — главный модуль. Открывается конструктор трека."}</p>
                </div>
              </div>
              <div className="guide-step">
                <span className="guide-step-num">2</span>
                <div>
                  <strong>{isEN ? "Choose the lyrics mode" : "Выбери режим текста"}</strong>
                  <p>{isEN ? "Three options: AI writes lyrics + vocals (default), your own lyrics (paste any text), or instrumental — no vocals at all." : "Три варианта: ИИ пишет текст + вокал (по умолчанию), свой текст (вставь любой), или инструментал — совсем без вокала."}</p>
                </div>
              </div>
              <div className="guide-step">
                <span className="guide-step-num">3</span>
                <div>
                  <strong>{isEN ? "Describe the idea" : "Опиши идею"}</strong>
                  <p>{isEN ? "In the description field write what you want: \"sad song about autumn, piano, female voice\" or \"energetic hip-hop for a workout\". The more detail, the better the result." : "В поле описания напиши, что хочешь: «грустная песня про осень, фортепиано, женский голос» или «энергичный хип-хоп для тренировки». Чем конкретнее, тем лучше результат."}</p>
                </div>
              </div>
              <div className="guide-step">
                <span className="guide-step-num">4</span>
                <div>
                  <strong>{isEN ? "Tune parameters (optional)" : "Настрой параметры (необязательно)"}</strong>
                  <p>{isEN ? "Chips for genre, mood, tempo, vocal gender, timbre. Leave them empty — RIFFA infers from your description. Or pick a few to narrow the result." : "Чипы жанра, настроения, темпа, пола вокала, тембра. Оставь пустыми — RIFFA угадает из описания. Или выбери несколько, чтобы сузить результат."}</p>
                </div>
              </div>
              <div className="guide-step">
                <span className="guide-step-num">5</span>
                <div>
                  <strong>{isEN ? "Click \"Create\"" : "Нажми «Создать»"}</strong>
                  <p>{isEN ? "The orange action button at the bottom of the form. Cost: 2 tokens. Suno returns TWO variants (V1 and V2) — usually within 3-5 minutes." : "Ораньжевая кнопка-действие внизу формы. Цена: 2 токена. Suno возвращает ДВА варианта (V1 и V2) — обычно за 3-5 минут."}</p>
                </div>
              </div>
              <div className="guide-step">
                <span className="guide-step-num">6</span>
                <div>
                  <strong>{isEN ? "Listen, pick a variant, download" : "Послушай, выбери вариант, скачай"}</strong>
                  <p>{isEN ? "Both variants appear in your library card. Each variant is independent — you can like one, share another, publish only the V1 you prefer to Radio. Download MP3 for social media, WAV for editing." : "Оба варианта появятся в карточке библиотеки. Каждый вариант независим — можно лайкнуть один, поделиться другим, выложить на Радио только тот, что больше понравился. Скачать MP3 для соцсетей, WAV для монтажа."}</p>
                </div>
              </div>
            </div>

            <div className="guide-tips">
              <div className="guide-tips-head">{isEN ? "Tips" : "Советы"}</div>
              <ul>
                <li>{isEN ? "Specify mood and scene: \"a slow song about departure at dawn, city sounds in the background\" works much better than just \"sad song\"." : "Указывай настроение и сцену: «медленная песня о расставании на рассвете, городские звуки на фоне» работает гораздо лучше, чем просто «грустная песня»."}</li>
                <li>{isEN ? "You always get two variants from one click — Suno generates a pair. Pick the better one, ignore the other or save both." : "За одно нажатие получишь два варианта — Suno всегда выдаёт пару. Выбери лучший, второй можно проигнорировать или сохранить."}</li>
                <li>{isEN ? "Don't like the result? Tweak the description and regenerate — cheaper than starting from scratch." : "Результат не нравится? Подкрути описание и сгенерируй заново — это дешевле, чем начинать с нуля."}</li>
              </ul>
            </div>
          </div>

          <div className="guide-mockup">
            <svg viewBox="0 0 320 260" xmlns="http://www.w3.org/2000/svg" style={{ fontFamily: "var(--font-mono)" }}>
              <rect width="320" height="260" fill="#F2EFE5" rx="12" />
              {/* tabs */}
              <rect x="12" y="14" width="68" height="24" rx="12" fill="#161413" />
              <text x="46" y="30" fontSize="8" fill="#E9E5DA" textAnchor="middle" fontWeight="600">ПЕСНЯ</text>
              <rect x="86" y="14" width="86" height="24" rx="12" stroke="#161413" strokeWidth="1" fill="#F2EFE5" />
              <text x="129" y="30" fontSize="8" fill="#161413" textAnchor="middle">ИНСТРУМЕНТАЛ</text>
              <rect x="178" y="14" width="56" height="24" rx="12" stroke="#161413" strokeWidth="1" fill="#F2EFE5" />
              <text x="206" y="30" fontSize="8" fill="#161413" textAnchor="middle">КАВЕР</text>
              <rect x="240" y="14" width="36" height="24" rx="12" stroke="#161413" strokeWidth="1" fill="#F2EFE5" />
              <text x="258" y="30" fontSize="8" fill="#161413" textAnchor="middle">SFX</text>

              {/* prompt area */}
              <rect x="12" y="50" width="296" height="72" rx="8" fill="#E9E5DA" />
              <text x="24" y="67" fontSize="7.5" fill="#161413" opacity="0.5">ОПИСАНИЕ ИДЕИ · 38 / 500</text>
              <text x="24" y="84" fontSize="12" fontWeight="600" fill="#161413">грустная песня про осень,</text>
              <text x="24" y="100" fontSize="12" fontWeight="600" fill="#161413">фортепиано, женский голос</text>
              <rect x="24" y="108" width="2.5" height="10" fill="#FF3B1F" />

              {/* params chips */}
              <rect x="12" y="134" width="60" height="22" rx="11" stroke="#161413" strokeWidth="1" fill="#F2EFE5" />
              <text x="42" y="149" fontSize="7.5" fill="#161413" textAnchor="middle">ЛИРИКА</text>
              <rect x="78" y="134" width="64" height="22" rx="11" stroke="#161413" strokeWidth="1" fill="#F2EFE5" />
              <text x="110" y="149" fontSize="7.5" fill="#161413" textAnchor="middle">Ж. ГОЛОС</text>
              <rect x="148" y="134" width="52" height="22" rx="11" stroke="#161413" strokeWidth="1" fill="#F2EFE5" />
              <text x="174" y="149" fontSize="7.5" fill="#161413" textAnchor="middle">72 BPM</text>
              <rect x="206" y="134" width="60" height="22" rx="11" stroke="#161413" strokeWidth="1" fill="#F2EFE5" />
              <text x="236" y="149" fontSize="7.5" fill="#161413" textAnchor="middle">2:30 МИН</text>

              {/* generate button */}
              <rect x="148" y="168" width="160" height="32" rx="16" fill="#FF3B1F" />
              <text x="228" y="188" fontSize="9" fontWeight="600" fill="#E9E5DA" textAnchor="middle">СОЗДАТЬ ТРЕК →</text>

              {/* player */}
              <rect x="12" y="214" width="296" height="34" rx="8" fill="#161413" />
              <circle cx="36" cy="231" r="11" fill="#E9E5DA" />
              <polygon points="33,225 33,237 43,231" fill="#161413" />
              <text x="56" y="227" fontSize="8" fontWeight="600" fill="#E9E5DA">осенняя мелодия</text>
              <text x="56" y="239" fontSize="7" fill="#8E887F">2:14 / 2:48 · ЛИРИКА</text>
              <rect x="200" y="224" width="42" height="16" rx="8" fill="#0F5D47" />
              <text x="221" y="235" fontSize="7" fill="#E9E5DA" textAnchor="middle" fontWeight="600">↓ MP3</text>
              <rect x="248" y="224" width="42" height="16" rx="8" stroke="#0F5D47" strokeWidth="1" fill="#161413" />
              <text x="269" y="235" fontSize="7" fill="#0F5D47" textAnchor="middle" fontWeight="600">↓ WAV</text>
            </svg>
          </div>
        </div>
      </div>

      {/* ─── 02 · Инструментал ─── */}
      <div className="h-section">
        <div className="tag"><span className="num">02</span> · {isEN ? "instrumental" : "инструментал"}</div>
        <h2>{isEN ? "Instrumental" : "Инструментал"}</h2>
      </div>
      <div className="guide-article">
        <div className="guide-cols">
          <div className="guide-text">
            <p className="guide-lead-text">
              {isEN
                ? "Music without vocals. Perfect for videos, podcasts, games, background music, and any project that needs a clean soundtrack."
                : "Музыка без вокала. Подходит для видео, подкастов, игр, фоновой музыки и любого проекта, которому нужен чистый саундтрек."}
            </p>

            <div className="guide-steps">
              <div className="guide-step">
                <span className="guide-step-num">1</span>
                <div>
                  <strong>{isEN ? "Open the Instrumental tile" : "Открой плитку «Инструментал»"}</strong>
                  <p>{isEN ? "On the Studio page click the \"Instrumental\" tile. The builder is simpler than for Song — no lyrics fields, no vocal options." : "На странице Студии нажми плитку «Инструментал». Конструктор проще, чем у песни — нет полей текста и вокала."}</p>
                </div>
              </div>
              <div className="guide-step">
                <span className="guide-step-num">2</span>
                <div>
                  <strong>{isEN ? "Describe the mood and style" : "Опиши настроение и стиль"}</strong>
                  <p>{isEN ? "Write: \"epic cinematic orchestral music for a battle scene\" or \"calm jazz for a coffee shop, piano and double bass\". Name instruments, tempo, atmosphere — Suno needs vocabulary." : "Напиши: «эпическая кинематографическая оркестровая музыка для батальной сцены» или «спокойный джаз для кофейни, фортепиано и контрабас». Называй инструменты, темп, атмосферу — Suno нужны конкретные слова."}</p>
                </div>
              </div>
              <div className="guide-step">
                <span className="guide-step-num">3</span>
                <div>
                  <strong>{isEN ? "Pick genre, mood, tempo" : "Выбери жанр, настроение, темп"}</strong>
                  <p>{isEN ? "Chips below the description. Tempo ranges from very slow (60–80 BPM) to very fast (140–180 BPM). RIFFA doesn't expose a duration knob — Suno picks ~2 minutes by default." : "Чипы под описанием. Темп — от очень медленного (60–80 BPM) до очень быстрого (140–180 BPM). Длительность RIFFA не настраивает — Suno сам выбирает ~2 минуты."}</p>
                </div>
              </div>
              <div className="guide-step">
                <span className="guide-step-num">4</span>
                <div>
                  <strong>{isEN ? "Generate and check both variants" : "Сгенерируй и проверь оба варианта"}</strong>
                  <p>{isEN ? "Click the action button. Cost: 2 tokens. Two variants come back — sometimes the second one is the winner. Listen end-to-end before deciding." : "Нажми кнопку-действие. Цена: 2 токена. Возвращается два варианта — иногда второй оказывается лучше первого. Послушай оба до конца перед выбором."}</p>
                </div>
              </div>
            </div>

            <div className="guide-tips">
              <div className="guide-tips-head">{isEN ? "Tips" : "Советы"}</div>
              <ul>
                <li>{isEN ? "Specify the purpose: \"for a product video\" or \"for a podcast intro\" helps the model nail the energy." : "Указывай назначение: «для продуктового видео» или «для интро подкаста» помогает модели подобрать правильную энергетику."}</li>
                <li>{isEN ? "Write what instruments you want. \"Acoustic guitar and strings, no drums\" beats \"calm music\"." : "Пиши, какие инструменты хочешь. «Акустическая гитара и струнные, без ударных» лучше «спокойной музыки»."}</li>
                <li>{isEN ? "Tempo chip: if you know your edit BPM, set it — the music will sit on the cut more naturally." : "Чип темпа: если знаешь BPM монтажа, задай его — музыка ляжет на склейки естественнее."}</li>
              </ul>
            </div>
          </div>

          <div className="guide-mockup">
            <svg viewBox="0 0 320 240" xmlns="http://www.w3.org/2000/svg" style={{ fontFamily: "var(--font-mono)" }}>
              <rect width="320" height="240" fill="#F2EFE5" rx="12" />
              {/* active tab */}
              <rect x="12" y="14" width="56" height="24" rx="12" stroke="#161413" strokeWidth="1" fill="#F2EFE5" />
              <text x="40" y="30" fontSize="8" fill="#161413" textAnchor="middle">ПЕСНЯ</text>
              <rect x="74" y="14" width="96" height="24" rx="12" fill="#161413" />
              <text x="122" y="30" fontSize="8" fill="#E9E5DA" textAnchor="middle" fontWeight="600">ИНСТРУМЕНТАЛ</text>
              <rect x="176" y="14" width="56" height="24" rx="12" stroke="#161413" strokeWidth="1" fill="#F2EFE5" />
              <text x="204" y="30" fontSize="8" fill="#161413" textAnchor="middle">КАВЕР</text>

              {/* prompt */}
              <rect x="12" y="50" width="296" height="64" rx="8" fill="#E9E5DA" />
              <text x="24" y="66" fontSize="7.5" fill="#161413" opacity="0.5">ОПИСАНИЕ ИДЕИ</text>
              <text x="24" y="82" fontSize="11.5" fontWeight="600" fill="#161413">эпический оркестр для</text>
              <text x="24" y="97" fontSize="11.5" fontWeight="600" fill="#161413">батальной сцены, 120 BPM</text>

              {/* duration chips */}
              <text x="12" y="132" fontSize="7.5" fill="#161413" opacity="0.5">ДЛИТЕЛЬНОСТЬ</text>
              <rect x="12" y="138" width="44" height="22" rx="11" stroke="#161413" strokeWidth="1" fill="#F2EFE5" />
              <text x="34" y="153" fontSize="7.5" fill="#161413" textAnchor="middle">0:30</text>
              <rect x="62" y="138" width="44" height="22" rx="11" stroke="#161413" strokeWidth="1" fill="#F2EFE5" />
              <text x="84" y="153" fontSize="7.5" fill="#161413" textAnchor="middle">1:00</text>
              <rect x="112" y="138" width="44" height="22" rx="11" fill="#161413" />
              <text x="134" y="153" fontSize="7.5" fill="#E9E5DA" textAnchor="middle" fontWeight="600">2:00</text>
              <rect x="162" y="138" width="44" height="22" rx="11" stroke="#161413" strokeWidth="1" fill="#F2EFE5" />
              <text x="184" y="153" fontSize="7.5" fill="#161413" textAnchor="middle">3:00</text>

              {/* instruments */}
              <text x="12" y="178" fontSize="7.5" fill="#161413" opacity="0.5">ИНСТРУМЕНТЫ</text>
              <rect x="12" y="184" width="68" height="22" rx="11" stroke="#161413" strokeWidth="1" fill="#F2EFE5" />
              <text x="46" y="199" fontSize="7.5" fill="#161413" textAnchor="middle">ОРКЕСТР</text>
              <rect x="86" y="184" width="64" height="22" rx="11" stroke="#161413" strokeWidth="1" fill="#F2EFE5" />
              <text x="118" y="199" fontSize="7.5" fill="#161413" textAnchor="middle">ЭПИЧНЫЙ</text>
              <rect x="156" y="184" width="62" height="22" rx="11" stroke="#161413" strokeWidth="1" fill="#F2EFE5" />
              <text x="187" y="199" fontSize="7.5" fill="#161413" textAnchor="middle">120 BPM</text>

              {/* button */}
              <rect x="148" y="210" width="160" height="22" rx="11" fill="#FF3B1F" />
              <text x="228" y="224" fontSize="8" fontWeight="600" fill="#E9E5DA" textAnchor="middle">СОЗДАТЬ ТРЕК →</text>
            </svg>
          </div>
        </div>
      </div>

      {/* ─── 03 · Кавер-версия ─── */}
      <div className="h-section">
        <div className="tag"><span className="num">03</span> · {isEN ? "cover" : "кавер"}</div>
        <h2>{isEN ? "Cover version" : "Кавер-версия"}</h2>
      </div>
      <div className="guide-article">
        <div className="guide-cols">
          <div className="guide-text">
            <p className="guide-lead-text">
              {isEN
                ? "Take YOUR OWN audio — a hummed melody, an instrument recording, a sketch — and let Suno rebuild it into a full produced track in a chosen style. Copyrighted hits won't work: Suno automatically rejects audio that matches known recordings."
                : "Возьми СВОЁ аудио — напев, запись инструмента, заготовку — и Suno соберёт из него полноценный продакшн в выбранном стиле. Чужие хиты не получится: Suno автоматически отклоняет аудио, совпадающее с известными записями."}
            </p>

            <div className="guide-steps">
              <div className="guide-step">
                <span className="guide-step-num">1</span>
                <div>
                  <strong>{isEN ? "Open the Cover tile" : "Открой плитку «Кавер»"}</strong>
                  <p>{isEN ? "On the Studio page click the \"Cover\" tile. The form opens with an audio uploader instead of a description-only field." : "На странице Студии нажми плитку «Кавер». Откроется форма, где сверху — загрузчик аудио, а не одно текстовое поле."}</p>
                </div>
              </div>
              <div className="guide-step">
                <span className="guide-step-num">2</span>
                <div>
                  <strong>{isEN ? "Upload audio or record your voice" : "Загрузи аудио или запиши голос"}</strong>
                  <p>{isEN ? "Two options: upload a file (mp3/m4a/wav) or click the microphone to record straight in the browser. Length: up to ~3 minutes. Suno will detect tempo, key and structure automatically." : "Два варианта: загрузить файл (mp3/m4a/wav) или нажать «микрофон» и записать прямо в браузере. Длительность — до ~3 минут. Suno сам определит темп, тональность и структуру."}</p>
                </div>
              </div>
              <div className="guide-step">
                <span className="guide-step-num">3</span>
                <div>
                  <strong>{isEN ? "Describe the target style" : "Опиши целевой стиль"}</strong>
                  <p>{isEN ? "In the style field explain how to transform it. \"Lo-fi hip-hop, slowed down, vinyl crackle\" or \"acoustic version with only guitar and voice\". Add lyrics if you want vocals." : "В поле стиля объясни, во что превратить. «Lo-fi hip-hop, замедленный, с потрескиванием винила» или «акустическая версия только гитара и голос». Добавь текст, если хочешь вокал."}</p>
                </div>
              </div>
              <div className="guide-step">
                <span className="guide-step-num">4</span>
                <div>
                  <strong>{isEN ? "Pick mood, tempo, vocal — optional" : "Выбери настроение, темп, вокал — опционально"}</strong>
                  <p>{isEN ? "Chips work the same way as for Song / Instrumental. \"Instrumental only\" disables vocals entirely. Cost: 2 tokens; you get two variants back." : "Чипы работают так же, как у Песни / Инструментала. «Только инструментал» полностью отключает вокал. Цена: 2 токена; в ответ — два варианта."}</p>
                </div>
              </div>
            </div>

            <div className="guide-tips">
              <div className="guide-tips-head">{isEN ? "Tips" : "Советы"}</div>
              <ul>
                <li>{isEN ? "Stylistic leap works best: hummed melody → trap, voice memo → orchestral. The bigger the gap, the more dramatic the result." : "Стилевой прыжок работает лучше всего: напев → trap, голосовая заметка → оркестр. Чем больше разница, тем эффектнее результат."}</li>
                <li>{isEN ? "Clean source = clean cover. Record close to the mic, mute background noise. Bad audio in → muddier result out." : "Чистый исходник = чистый кавер. Записывай близко к микрофону, убирай фоновый шум. Грязное аудио на входе → мутнее результат."}</li>
                <li>{isEN ? "Cover is great for personal voice memos — turn a humming idea into a full demo without engineering skills." : "Кавер отлично работает с личными голосовыми заметками — превращает идею-напев в полноценное демо без навыков продакшна."}</li>
              </ul>
            </div>
          </div>

          <div className="guide-mockup">
            <svg viewBox="0 0 320 240" xmlns="http://www.w3.org/2000/svg" style={{ fontFamily: "var(--font-mono)" }}>
              <rect width="320" height="240" fill="#F2EFE5" rx="12" />
              {/* tabs */}
              <rect x="12" y="14" width="54" height="24" rx="12" stroke="#161413" strokeWidth="1" fill="#F2EFE5" />
              <text x="39" y="30" fontSize="8" fill="#161413" textAnchor="middle">ПЕСНЯ</text>
              <rect x="72" y="14" width="86" height="24" rx="12" stroke="#161413" strokeWidth="1" fill="#F2EFE5" />
              <text x="115" y="30" fontSize="8" fill="#161413" textAnchor="middle">ИНСТРУМЕНТАЛ</text>
              <rect x="164" y="14" width="56" height="24" rx="12" fill="#161413" />
              <text x="192" y="30" fontSize="8" fill="#E9E5DA" textAnchor="middle" fontWeight="600">КАВЕР</text>
              {/* original field */}
              <text x="12" y="56" fontSize="7.5" fill="#161413" opacity="0.5">ОРИГИНАЛЬНАЯ ПЕСНЯ</text>
              <rect x="12" y="62" width="296" height="34" rx="8" fill="#E9E5DA" />
              <text x="24" y="78" fontSize="11" fontWeight="600" fill="#161413">Bohemian Rhapsody — Queen</text>
              <text x="24" y="91" fontSize="7.5" fill="#0F5D47" fontWeight="600">✓ НАЙДЕНО</text>
              {/* new style */}
              <text x="12" y="110" fontSize="7.5" fill="#161413" opacity="0.5">НОВЫЙ СТИЛЬ</text>
              <rect x="12" y="116" width="296" height="50" rx="8" fill="#E9E5DA" />
              <text x="24" y="133" fontSize="11" fontWeight="600" fill="#161413">в стиле lo-fi hip-hop,</text>
              <text x="24" y="149" fontSize="11" fontWeight="600" fill="#161413">с потрескиванием винила</text>
              {/* voice chips */}
              <rect x="12" y="178" width="64" height="22" rx="11" stroke="#161413" strokeWidth="1" fill="#F2EFE5" />
              <text x="44" y="193" fontSize="7.5" fill="#161413" textAnchor="middle">М. ГОЛОС</text>
              <rect x="82" y="178" width="64" height="22" rx="11" fill="#161413" />
              <text x="114" y="193" fontSize="7.5" fill="#E9E5DA" textAnchor="middle" fontWeight="600">Ж. ГОЛОС</text>
              {/* button */}
              <rect x="148" y="210" width="160" height="22" rx="11" fill="#FF3B1F" />
              <text x="228" y="224" fontSize="8" fontWeight="600" fill="#E9E5DA" textAnchor="middle">СОЗДАТЬ КАВЕР →</text>
            </svg>
          </div>
        </div>
      </div>

      {/* ─── 04 · Звуковой эффект ─── */}
      <div className="h-section">
        <div className="tag"><span className="num">04</span> · {isEN ? "sfx" : "звук. эффект"}</div>
        <h2>{isEN ? "Sound effect (SFX)" : "Звуковой эффект (SFX)"}</h2>
      </div>
      <div className="guide-article">
        <div className="guide-cols">
          <div className="guide-text">
            <p className="guide-lead-text">
              {isEN
                ? "Short sound effects: notifications, explosions, footsteps, interface sounds, nature sounds, and anything else you can describe in words."
                : "Короткие звуковые эффекты: уведомления, взрывы, шаги, звуки интерфейса, природа и всё остальное, что можно описать словами."}
            </p>

            <div className="guide-steps">
              <div className="guide-step">
                <span className="guide-step-num">1</span>
                <div>
                  <strong>{isEN ? "Open the SFX tile" : "Открой плитку «Звуковой эффект»"}</strong>
                  <p>{isEN ? "On the Studio page click the SFX tile. The form is the most minimal — pick source, environment, duration, style." : "На странице Студии нажми плитку «Звуковой эффект». Форма самая минимальная — выбери источник, среду, длительность, стиль."}</p>
                </div>
              </div>
              <div className="guide-step">
                <span className="guide-step-num">2</span>
                <div>
                  <strong>{isEN ? "Describe the sound precisely" : "Опиши звук точно"}</strong>
                  <p>{isEN ? "The more precise, the more accurate the result. \"Wooden door creaking and closing\" beats \"door sound\". \"App notification with metallic resonance, 0.5 seconds\" beats \"notification\"." : "Чем точнее, тем точнее результат. «Скрип деревянной двери и её закрытие» лучше «звука двери». «Уведомление приложения с металлическим резонансом, 0.5 секунды» лучше «уведомления»."}</p>
                </div>
              </div>
              <div className="guide-step">
                <span className="guide-step-num">3</span>
                <div>
                  <strong>{isEN ? "Pick source · environment · duration · style" : "Выбери источник · среду · длительность · стиль"}</strong>
                  <p>{isEN ? "Source (impact, glitch, nature, mechanical, whoosh, custom), environment (studio, room, street, forest, space), length (short 1–2s, medium 3–6s, long 10+s ambience), style (cinematic, realistic, clean)." : "Источник (удар, glitch, природа, механика, whoosh, свой), среда (студия, комната, улица, лес, космос), длительность (короткий 1–2 c, средний 3–6 c, длинный амбиент 10+ c), стиль (киношный, реалистичный, чистый)."}</p>
                </div>
              </div>
              <div className="guide-step">
                <span className="guide-step-num">4</span>
                <div>
                  <strong>{isEN ? "Generate and download" : "Сгенерируй и скачай"}</strong>
                  <p>{isEN ? "Cost: 1 token (cheaper than music). Download MP3 (compatible everywhere) or WAV (lossless for editing in a DAW / game engine)." : "Цена: 1 токен (дешевле музыки). Скачай MP3 (играет везде) или WAV (без потерь, для DAW / игрового движка)."}</p>
                </div>
              </div>
            </div>

            <div className="guide-tips">
              <div className="guide-tips-head">{isEN ? "Tips" : "Советы"}</div>
              <ul>
                <li>{isEN ? "For game sounds add context: \"laser shot in a sci-fi game, medium power\" or \"coin pick-up in a 2D platformer\"." : "Для игровых звуков добавляй контекст: «выстрел лазером в sci-fi игре, средней мощности» или «подбор монеты в 2D-платформере»."}</li>
                <li>{isEN ? "Texture words shift the result hard: \"dry\", \"reverberant\", \"muffled\", \"crisp\", \"glitchy\", \"organic\"." : "Слова текстуры сильно сдвигают результат: «сухой», «с реверберацией», «приглушённый», «резкий», «глитчевый», «органический»."}</li>
                <li>{isEN ? "SFX is the cheapest generation — try several phrasings to find the right one." : "SFX — самая дешёвая генерация. Перепробуй несколько формулировок, чтобы найти точную."}</li>
              </ul>
            </div>
          </div>

          <div className="guide-mockup">
            <svg viewBox="0 0 320 220" xmlns="http://www.w3.org/2000/svg" style={{ fontFamily: "var(--font-mono)" }}>
              <rect width="320" height="220" fill="#F2EFE5" rx="12" />
              {/* SFX tab active */}
              <rect x="12" y="14" width="54" height="24" rx="12" stroke="#161413" strokeWidth="1" fill="#F2EFE5" />
              <text x="39" y="30" fontSize="8" fill="#161413" textAnchor="middle">ПЕСНЯ</text>
              <rect x="72" y="14" width="66" height="24" rx="12" stroke="#161413" strokeWidth="1" fill="#F2EFE5" />
              <text x="105" y="30" fontSize="8" fill="#161413" textAnchor="middle">ОБЛОЖКА</text>
              <rect x="144" y="14" width="54" height="24" rx="12" stroke="#161413" strokeWidth="1" fill="#F2EFE5" />
              <text x="171" y="30" fontSize="8" fill="#161413" textAnchor="middle">КАВЕР</text>
              <rect x="204" y="14" width="36" height="24" rx="12" fill="#161413" />
              <text x="222" y="30" fontSize="8" fill="#E9E5DA" textAnchor="middle" fontWeight="600">SFX</text>

              {/* prompt */}
              <rect x="12" y="50" width="296" height="58" rx="8" fill="#E9E5DA" />
              <text x="24" y="66" fontSize="7.5" fill="#161413" opacity="0.5">ОПИСАНИЕ ЗВУКА</text>
              <text x="24" y="82" fontSize="11" fontWeight="600" fill="#161413">скрип деревянной двери</text>
              <text x="24" y="98" fontSize="11" fontWeight="600" fill="#161413">и её закрытие</text>

              {/* duration */}
              <text x="12" y="124" fontSize="7.5" fill="#161413" opacity="0.5">ДЛИТЕЛЬНОСТЬ</text>
              <rect x="12" y="130" width="38" height="22" rx="11" stroke="#161413" strokeWidth="1" fill="#F2EFE5" />
              <text x="31" y="145" fontSize="7.5" fill="#161413" textAnchor="middle">0:02</text>
              <rect x="56" y="130" width="38" height="22" rx="11" fill="#161413" />
              <text x="75" y="145" fontSize="7.5" fill="#E9E5DA" textAnchor="middle" fontWeight="600">0:05</text>
              <rect x="100" y="130" width="38" height="22" rx="11" stroke="#161413" strokeWidth="1" fill="#F2EFE5" />
              <text x="119" y="145" fontSize="7.5" fill="#161413" textAnchor="middle">0:10</text>
              <rect x="144" y="130" width="38" height="22" rx="11" stroke="#161413" strokeWidth="1" fill="#F2EFE5" />
              <text x="163" y="145" fontSize="7.5" fill="#161413" textAnchor="middle">0:30</text>

              {/* category chips */}
              <text x="12" y="170" fontSize="7.5" fill="#161413" opacity="0.5">КАТЕГОРИЯ</text>
              <rect x="12" y="176" width="48" height="22" rx="11" stroke="#161413" strokeWidth="1" fill="#F2EFE5" />
              <text x="36" y="191" fontSize="7" fill="#161413" textAnchor="middle">ПРИРОДА</text>
              <rect x="66" y="176" width="56" height="22" rx="11" stroke="#0F5D47" strokeWidth="1" fill="#F2EFE5" />
              <text x="94" y="191" fontSize="7" fill="#0F5D47" textAnchor="middle">БЫТОВЫЕ</text>
              <rect x="128" y="176" width="40" height="22" rx="11" stroke="#161413" strokeWidth="1" fill="#F2EFE5" />
              <text x="148" y="191" fontSize="7" fill="#161413" textAnchor="middle">UI</text>
              <rect x="174" y="176" width="48" height="22" rx="11" stroke="#161413" strokeWidth="1" fill="#F2EFE5" />
              <text x="198" y="191" fontSize="7" fill="#161413" textAnchor="middle">ИГРОВЫЕ</text>

              {/* button */}
              <rect x="148" y="192" width="160" height="22" rx="11" fill="#FF3B1F" />
              <text x="228" y="206" fontSize="8" fontWeight="600" fill="#E9E5DA" textAnchor="middle">СОЗДАТЬ SFX →</text>
            </svg>
          </div>
        </div>
      </div>

      {/* ─── 05 · Обложка ─── */}
      <div className="h-section">
        <div className="tag"><span className="num">05</span> · {isEN ? "cover art" : "обложка"}</div>
        <h2>{isEN ? "Cover art" : "Обложка"}</h2>
      </div>
      <div className="guide-article">
        <div className="guide-cols">
          <div className="guide-text">
            <p className="guide-lead-text">
              {isEN
                ? "Generate album artwork, single cover art, or an illustration for a podcast. Works together with your tracks — describe the image or let RIFFA match it to the music."
                : "Создай обложку альбома, сингла или иллюстрацию для подкаста. Работает вместе с треками — опиши образ или позволь RIFFA подобрать его по музыке."}
            </p>

            <div className="guide-steps">
              <div className="guide-step">
                <span className="guide-step-num">1</span>
                <div>
                  <strong>{isEN ? "Open the Cover Art tile" : "Открой плитку «Обложка»"}</strong>
                  <p>{isEN ? "On the Studio page click the \"Cover\" tile. The cover art builder opens — image generation, not music." : "На странице Студии нажми плитку «Обложка». Откроется конструктор обложки — это уже не музыка, а изображение."}</p>
                </div>
              </div>
              <div className="guide-step">
                <span className="guide-step-num">2</span>
                <div>
                  <strong>{isEN ? "Describe the visual brief or ask the agent" : "Опиши визуальный бриф или спроси у агента"}</strong>
                  <p>{isEN ? "Either write the prompt yourself (in English works best — \"album cover, lonely figure in a foggy field at dawn, golden tones, minimal\") or click \"Ask the agent\" and answer 4–5 questions in chat — the agent assembles the prompt for you." : "Либо напиши промт сам (лучше на английском — «album cover, lonely figure in a foggy field at dawn, golden tones, minimal»), либо нажми «Спросить агента» и ответь на 4–5 вопросов в чате — агент сам соберёт промт."}</p>
                </div>
              </div>
              <div className="guide-step">
                <span className="guide-step-num">3</span>
                <div>
                  <strong>{isEN ? "Attach a reference (optional)" : "Прикрепи референс (опционально)"}</strong>
                  <p>{isEN ? "Drop an image or paste a URL into the reference field. Nano Banana 2 / Pro use it as a composition or style anchor." : "Перетащи картинку или вставь URL в поле референса. Nano Banana 2 / Pro используют его как ориентир композиции или стиля."}</p>
                </div>
              </div>
              <div className="guide-step">
                <span className="guide-step-num">4</span>
                <div>
                  <strong>{isEN ? "Pick the model" : "Выбери модель"}</strong>
                  <p>{isEN ? "Nano Banana (1 token) for quick drafts, Nano Banana 2 (2 tokens) for higher quality, Nano Banana Pro (3 tokens) for the cleanest result. All output 1024×1024 square — perfect for streaming covers." : "Nano Banana (1 токен) — для быстрых черновиков, Nano Banana 2 (2 токена) — выше качество, Nano Banana Pro (3 токена) — самый чистый результат. Все выдают 1024×1024 квадрат — формат под стриминг."}</p>
                </div>
              </div>
              <div className="guide-step">
                <span className="guide-step-num">5</span>
                <div>
                  <strong>{isEN ? "Generate, download" : "Сгенерируй, скачай"}</strong>
                  <p>{isEN ? "The cover appears in the library card alongside your music. Download PNG/JPG for upload to Spotify, Apple Music, iTunes. If it's not perfect — tweak the prompt, regenerate." : "Обложка появится в карточке библиотеки рядом с музыкой. Скачай PNG/JPG для Spotify, Apple Music, iTunes. Не идеально — подкрути промт и сгенерируй заново."}</p>
                </div>
              </div>
            </div>

            <div className="guide-tips">
              <div className="guide-tips-head">{isEN ? "Tips" : "Советы"}</div>
              <ul>
                <li>{isEN ? "English prompts work better for image models — Cyrillic is OK but adds noise. The agent always emits English." : "Английский промт работает лучше для image-моделей — кириллица допустима, но добавляет шум. Агент всегда пишет промт на английском."}</li>
                <li>{isEN ? "Specify the palette: \"warm tones, red and orange\" or \"cold monochrome, blue-grey\" — narrows the result dramatically." : "Указывай палитру: «warm tones, red and orange» или «cold monochrome, blue-grey» — кардинально сужает результат."}</li>
                <li>{isEN ? "Avoid artist or song titles in the prompt — image models add unwanted text artefacts. Describe the visual idea instead." : "Не пиши имена артистов или названия песен в промте — модели добавляют ненужные текстовые артефакты. Описывай только визуальную идею."}</li>
              </ul>
            </div>
          </div>

          <div className="guide-mockup">
            <svg viewBox="0 0 320 250" xmlns="http://www.w3.org/2000/svg" style={{ fontFamily: "var(--font-mono)" }}>
              <rect width="320" height="250" fill="#F2EFE5" rx="12" />
              {/* tabs */}
              <rect x="12" y="14" width="54" height="24" rx="12" stroke="#161413" strokeWidth="1" fill="#F2EFE5" />
              <text x="39" y="30" fontSize="8" fill="#161413" textAnchor="middle">ПЕСНЯ</text>
              <rect x="72" y="14" width="56" height="24" rx="12" fill="#161413" />
              <text x="100" y="30" fontSize="8" fill="#E9E5DA" textAnchor="middle" fontWeight="600">ОБЛОЖКА</text>
              <rect x="134" y="14" width="54" height="24" rx="12" stroke="#161413" strokeWidth="1" fill="#F2EFE5" />
              <text x="161" y="30" fontSize="8" fill="#161413" textAnchor="middle">КАВЕР</text>

              {/* cover preview placeholder */}
              <rect x="12" y="50" width="130" height="130" rx="8" fill="#E9E5DA" />
              {/* generated image mock */}
              <defs>
                <radialGradient id="sunsetGrad" cx="50%" cy="60%" r="60%">
                  <stop offset="0%" stopColor="#FF3B1F" stopOpacity="0.6" />
                  <stop offset="60%" stopColor="#FF8C00" stopOpacity="0.3" />
                  <stop offset="100%" stopColor="#E9E5DA" stopOpacity="0" />
                </radialGradient>
              </defs>
              <rect x="12" y="50" width="130" height="130" rx="8" fill="url(#sunsetGrad)" />
              <ellipse cx="77" cy="155" rx="40" ry="6" fill="#161413" opacity="0.1" />
              <rect x="68" y="105" width="18" height="42" rx="3" fill="#161413" opacity="0.25" />
              <text x="77" y="192" fontSize="7" fill="#161413" opacity="0.4" textAnchor="middle">3000 × 3000 px</text>

              {/* description input */}
              <rect x="152" y="50" width="156" height="60" rx="8" fill="#E9E5DA" />
              <text x="164" y="66" fontSize="7.5" fill="#161413" opacity="0.5">ОПИСАНИЕ ОБРАЗА</text>
              <text x="164" y="80" fontSize="9" fontWeight="600" fill="#161413">одинокая фигура</text>
              <text x="164" y="93" fontSize="9" fontWeight="600" fill="#161413">в поле на закате</text>
              <text x="164" y="106" fontSize="9" fontWeight="600" fill="#161413">золотые тона</text>

              {/* style chips */}
              <text x="152" y="124" fontSize="7.5" fill="#161413" opacity="0.5">СТИЛЬ</text>
              <rect x="152" y="130" width="58" height="20" rx="10" fill="#161413" />
              <text x="181" y="143" fontSize="7" fill="#E9E5DA" textAnchor="middle" fontWeight="600">ФОТО</text>
              <rect x="216" y="130" width="58" height="20" rx="10" stroke="#161413" strokeWidth="1" fill="#F2EFE5" />
              <text x="245" y="143" fontSize="7" fill="#161413" textAnchor="middle">АРТ</text>

              {/* format */}
              <text x="152" y="162" fontSize="7.5" fill="#161413" opacity="0.5">ФОРМАТ</text>
              <rect x="152" y="168" width="44" height="20" rx="10" fill="#161413" />
              <text x="174" y="181" fontSize="7" fill="#E9E5DA" textAnchor="middle" fontWeight="600">1:1</text>
              <rect x="202" y="168" width="44" height="20" rx="10" stroke="#161413" strokeWidth="1" fill="#F2EFE5" />
              <text x="224" y="181" fontSize="7" fill="#161413" textAnchor="middle">4:3</text>

              {/* button */}
              <rect x="12" y="192" width="296" height="26" rx="13" fill="#FF3B1F" />
              <text x="160" y="208" fontSize="9" fontWeight="600" fill="#E9E5DA" textAnchor="middle">СОЗДАТЬ ОБЛОЖКУ →</text>

              {/* download */}
              <rect x="12" y="226" width="142" height="18" rx="9" fill="#0F5D47" />
              <text x="83" y="238" fontSize="7.5" fill="#E9E5DA" textAnchor="middle" fontWeight="600">↓ СКАЧАТЬ 3000px</text>
            </svg>
          </div>
        </div>
      </div>

      {/* ─── 06 · ИИ-Агент ─── */}
      <div className="h-section">
        <div className="tag"><span className="num">06</span> · {isEN ? "ai agent" : "ии-агент"}</div>
        <h2>{isEN ? "AI Agent" : "ИИ-Агент"}</h2>
      </div>
      <div className="guide-article">
        <div className="guide-cols">
          <div className="guide-text">
            <p className="guide-lead-text">
              {isEN
                ? "A world-class music expert in chat form. Tell it \"I want music like HVOB\" or \"instrumental in the spirit of AC/DC\" — the agent recognises the artist, identifies their signature instruments and production, and builds a Suno-ready brief for you."
                : "Музыкальный эксперт мирового уровня в формате чата. Скажи «хочу музыку как у HVOB» или «инструментал в духе AC/DC» — агент узнает артиста, разберёт его инструменты и продакшн, и соберёт готовый бриф для Suno."}
            </p>

            <div className="guide-steps">
              <div className="guide-step">
                <span className="guide-step-num">1</span>
                <div>
                  <strong>{isEN ? "Open the Agent" : "Открой агента"}</strong>
                  <p>{isEN ? "Click \"Agent\" in the sidebar, or use the agent panel. The chat opens with a greeting." : "Нажми «Агент» в сайдбаре или используй панель агента. Чат откроется с приветствием."}</p>
                </div>
              </div>
              <div className="guide-step">
                <span className="guide-step-num">2</span>
                <div>
                  <strong>{isEN ? "Say what you want — short or long" : "Скажи, что хочешь — коротко или подробно"}</strong>
                  <p>{isEN ? "Both work. \"Music like HVOB\", \"birthday song for mum\", \"sad lo-fi for studying\", \"surprise me\". The agent adapts: rich brief → 0–1 clarifying questions, vague → 2–3 questions with quick-reply chips." : "Работает и то, и другое. «Музыка как у HVOB», «песня маме на ДР», «грустный lo-fi под учёбу», «удиви меня». Агент адаптируется: подробный бриф → 0–1 вопрос, размытый → 2–3 вопроса с быстрыми чипами-ответами."}</p>
                </div>
              </div>
              <div className="guide-step">
                <span className="guide-step-num">3</span>
                <div>
                  <strong>{isEN ? "Click the chips or type freely" : "Тыкай по чипам или пиши свободно"}</strong>
                  <p>{isEN ? "Each agent question offers 2–4 short reply chips (\"slow\", \"medium\", \"fast\"; \"sad\", \"epic\", \"warm\"). Click one to keep the flow moving, or type your own answer for nuance." : "На каждый вопрос агент предложит 2–4 коротких чипа-ответа («медленный», «средний», «быстрый»; «грустная», «эпичная», «тёплая»). Тыкни — пойдёшь дальше; напиши своё, если хочешь нюансов."}</p>
                </div>
              </div>
              <div className="guide-step">
                <span className="guide-step-num">4</span>
                <div>
                  <strong>{isEN ? "Review the brief, launch generation" : "Проверь бриф и запусти генерацию"}</strong>
                  <p>{isEN ? "When ready, the agent shows a structured brief (theme, instruments, mood, tempo) and two buttons: \"Launch generation\" (sends straight to Suno) or \"Refine the brief\" (returns to chat to keep tuning)." : "Когда бриф готов, агент покажет структурированную сводку (тема, инструменты, настроение, темп) и две кнопки: «Запустить генерацию» (отправит в Suno) или «Дополнить бриф» (вернёт в чат для доработки)."}</p>
                </div>
              </div>
              <div className="guide-step">
                <span className="guide-step-num">5</span>
                <div>
                  <strong>{isEN ? "Or just ask musical questions" : "Или просто задавай музыкальные вопросы"}</strong>
                  <p>{isEN ? "Outside of generation flow, the agent works as a music consultant. \"What instruments are in dungeon synth?\", \"How does sidechain compression sound?\" — full answers, no fluff." : "Вне процесса генерации агент работает как музыкальный консультант. «Какие инструменты в dungeon synth?», «Как звучит sidechain-компрессия?» — отвечает по сути, без воды."}</p>
                </div>
              </div>
            </div>

            <div className="guide-tips">
              <div className="guide-tips-head">{isEN ? "Tips" : "Советы"}</div>
              <ul>
                <li>{isEN ? "Use artist references: \"in the style of Burial\", \"like early Radiohead\". The agent does the music research and translates the reference into English Suno vocabulary — without writing the artist's name in the prompt (Suno rejects those)." : "Используй ссылки на артистов: «в стиле Burial», «как ранний Radiohead». Агент сам проведёт музыкальный research и переведёт ссылку в английскую лексику для Suno — без упоминания имени артиста (Suno отвергает такие промты)."}</li>
                <li>{isEN ? "The conversation persists for 24 hours and survives page reloads. Click \"↺ New chat\" in the header to start fresh." : "Диалог сохраняется на 24 часа и переживает перезагрузку страницы. Нажми «↺ Новый чат» в шапке, чтобы начать с нуля."}</li>
                <li>{isEN ? "If you don't like the brief, use \"Refine the brief\" — the agent keeps all the context and just tweaks what you ask for." : "Не нравится бриф — нажми «Дополнить бриф», агент сохранит весь контекст и докрутит то, что попросишь."}</li>
              </ul>
            </div>
          </div>

          <div className="guide-mockup">
            <svg viewBox="0 0 320 280" xmlns="http://www.w3.org/2000/svg" style={{ fontFamily: "var(--font-mono)" }}>
              <rect width="320" height="280" fill="#F2EFE5" rx="12" />
              {/* chat window */}
              <rect x="12" y="12" width="296" height="216" rx="10" fill="#E9E5DA" />
              {/* header */}
              <rect x="12" y="12" width="296" height="32" rx="10" fill="#161413" />
              <circle cx="32" cy="28" r="7" fill="#0F5D47" />
              <text x="48" y="32" fontSize="9" fontWeight="600" fill="#E9E5DA">ИИ-Агент</text>
              <text x="296" y="32" fontSize="8" fill="#E9E5DA" opacity="0.5" textAnchor="end">онлайн</text>

              {/* messages */}
              <rect x="24" y="54" width="200" height="36" rx="6" fill="#F2EFE5" />
              <text x="36" y="68" fontSize="8.5" fill="#161413">Нужна музыка на день рождения</text>
              <text x="36" y="83" fontSize="8.5" fill="#161413">для мамы, что-то лирическое</text>

              <rect x="60" y="100" width="220" height="44" rx="6" fill="#0F5D47" opacity="0.15" />
              <text x="72" y="114" fontSize="8" fill="#161413">Отличная идея! Несколько вопросов:</text>
              <text x="72" y="127" fontSize="8" fill="#161413">1. Сколько лет маме?</text>
              <text x="72" y="140" fontSize="8" fill="#161413">2. Какой жанр ей нравится?</text>

              <rect x="24" y="154" width="180" height="26" rx="6" fill="#F2EFE5" />
              <text x="36" y="164" fontSize="8.5" fill="#161413">60 лет, любит классику</text>
              <text x="36" y="176" fontSize="8.5" fill="#161413">и Пугачёву</text>

              <rect x="60" y="190" width="220" height="26" rx="6" fill="#0F5D47" opacity="0.15" />
              <text x="72" y="202" fontSize="8" fill="#161413">Готово! Промт для тебя:</text>
              <text x="72" y="213" fontSize="8" fill="#0F5D47" fontWeight="600">«лирическая песня на 60 лет...»</text>

              {/* action buttons */}
              <rect x="12" y="238" width="142" height="30" rx="15" fill="#0F5D47" />
              <text x="83" y="256" fontSize="8.5" fontWeight="600" fill="#E9E5DA" textAnchor="middle">ОТПРАВИТЬ В СТУДИЮ</text>
              <rect x="162" y="238" width="146" height="30" rx="15" stroke="#161413" strokeWidth="1" fill="#F2EFE5" />
              <text x="235" y="256" fontSize="8.5" fill="#161413" textAnchor="middle">РЕДАКТИРОВАТЬ</text>

              {/* text input */}
              <rect x="12" y="252" width="220" height="22" rx="11" fill="#E9E5DA" />
              <text x="24" y="266" fontSize="8" fill="#161413" opacity="0.4">Написать агенту...</text>
              <rect x="240" y="252" width="68" height="22" rx="11" fill="#161413" />
              <text x="274" y="266" fontSize="8" fontWeight="600" fill="#E9E5DA" textAnchor="middle">ОТПРАВИТЬ</text>
            </svg>
          </div>
        </div>
      </div>

      {/* ─── 07 · Библиотека ─── */}
      <div className="h-section">
        <div className="tag"><span className="num">07</span> · {isEN ? "library" : "библиотека"}</div>
        <h2>{isEN ? "Library" : "Библиотека"}</h2>
      </div>
      <div className="guide-article">
        <div className="guide-cols">
          <div className="guide-text">
            <p className="guide-lead-text">
              {isEN
                ? "Every variant (V1 and V2) of every generation lives in your Library as an independent file — listen, like, share, publish to Radio, download MP3/WAV, soft-delete to Trash."
                : "Каждый вариант (V1 и V2) каждой генерации хранится в Библиотеке как отдельный файл — можно слушать, лайкать, делиться, выкладывать на Радио, скачивать MP3/WAV, переносить в Корзину."}
            </p>

            <div className="guide-steps">
              <div className="guide-step">
                <span className="guide-step-num">1</span>
                <div>
                  <strong>{isEN ? "Open the Library" : "Открой Библиотеку"}</strong>
                  <p>{isEN ? "Sidebar → \"Library\". All your creations live here, newest first. Includes songs, instrumentals, covers, SFX, cover art." : "Сайдбар → «Библиотека». Все создания тут, сначала новые. Включает песни, инструменталы, каверы, SFX, обложки."}</p>
                </div>
              </div>
              <div className="guide-step">
                <span className="guide-step-num">2</span>
                <div>
                  <strong>{isEN ? "Filter by type and search" : "Фильтруй по типу и поиску"}</strong>
                  <p>{isEN ? "Toggle the type chips at the top (All · Songs · Instrumentals · SFX · Covers · Cover Art). Use the search box to find by title." : "Чипы типа сверху (Все · Песни · Инструменталы · SFX · Каверы · Обложки). Поиск — по заголовку трека."}</p>
                </div>
              </div>
              <div className="guide-step">
                <span className="guide-step-num">3</span>
                <div>
                  <strong>{isEN ? "Each card has its own actions" : "У каждой карточки — свои действия"}</strong>
                  <p>{isEN ? "Per track: play, like / dislike, share, publish to Radio, download MP3 / WAV, delete. V1 and V2 from the same generation are separate cards with separate counters — your like on V1 doesn't affect V2." : "По треку: плей, лайк / дизлайк, шаринг, публикация на Радио, скачать MP3 / WAV, удалить. V1 и V2 одной генерации — отдельные карточки с отдельными счётчиками: лайк на V1 не влияет на V2."}</p>
                </div>
              </div>
              <div className="guide-step">
                <span className="guide-step-num">4</span>
                <div>
                  <strong>{isEN ? "Share or publish" : "Поделись или опубликуй"}</strong>
                  <p>{isEN ? "\"Share\" gives a public /s/ link — listenable without login. \"Publish to Radio\" makes the track visible to all RIFFA users on the Radio page — you can publish V1 or V2, or both options." : "«Поделиться» даёт публичную ссылку /s/ — слушать без входа. «На Радио» — выкладывает трек на страницу Радио, открыто всем пользователям RIFFA. Можно опубликовать V1 или V2, либо оба варианта."}</p>
                </div>
              </div>
            </div>

            <div className="guide-tips">
              <div className="guide-tips-head">{isEN ? "Tips" : "Советы"}</div>
              <ul>
                <li>{isEN ? "Titles default to \"YourNickname — Auto Title\". Rename anything by clicking the title in the file card." : "Заголовок по умолчанию — «ТвойНик — Авто-название». Переименовать можно, кликнув по заголовку в карточке файла."}</li>
                <li>{isEN ? "The player at the bottom is global: it keeps playing while you browse other pages. Hit the queue icon to see what's next." : "Глобальный плеер внизу не останавливается при переходах между страницами. Иконка очереди показывает, что играет следующим."}</li>
                <li>{isEN ? "Soft-deleted tracks live in Trash for 7 days before being purged. Restore from there if you change your mind." : "Удалённые треки лежат в Корзине 7 дней перед окончательным удалением. Если передумал — восстанови оттуда."}</li>
              </ul>
            </div>
          </div>

          <div className="guide-mockup">
            <svg viewBox="0 0 320 270" xmlns="http://www.w3.org/2000/svg" style={{ fontFamily: "var(--font-mono)" }}>
              <rect width="320" height="270" fill="#F2EFE5" rx="12" />
              {/* filter tabs */}
              <rect x="12" y="14" width="38" height="22" rx="11" fill="#161413" />
              <text x="31" y="29" fontSize="7.5" fill="#E9E5DA" textAnchor="middle" fontWeight="600">ВСЕ</text>
              <rect x="56" y="14" width="44" height="22" rx="11" stroke="#161413" strokeWidth="1" fill="#F2EFE5" />
              <text x="78" y="29" fontSize="7.5" fill="#161413" textAnchor="middle">ПЕСНИ</text>
              <rect x="106" y="14" width="80" height="22" rx="11" stroke="#161413" strokeWidth="1" fill="#F2EFE5" />
              <text x="146" y="29" fontSize="7.5" fill="#161413" textAnchor="middle">ИНСТРУМЕНТАЛЫ</text>
              <rect x="192" y="14" width="36" height="22" rx="11" stroke="#161413" strokeWidth="1" fill="#F2EFE5" />
              <text x="210" y="29" fontSize="7.5" fill="#161413" textAnchor="middle">SFX</text>
              <rect x="234" y="14" width="68" height="22" rx="11" stroke="#161413" strokeWidth="1" fill="#F2EFE5" />
              <text x="268" y="29" fontSize="7.5" fill="#161413" textAnchor="middle">ОБЛОЖКИ</text>

              {/* track rows */}
              {/* track 1 */}
              <rect x="12" y="48" width="296" height="48" rx="8" fill="#E9E5DA" />
              <rect x="20" y="56" width="32" height="32" rx="6" fill="#FF3B1F" />
              <polygon points="31,65 31,79 42,72" fill="#E9E5DA" />
              <text x="62" y="69" fontSize="9" fontWeight="600" fill="#161413">осенняя мелодия</text>
              <text x="62" y="82" fontSize="7.5" fill="#161413" opacity="0.5">ПЕСНЯ · 2:48 · сегодня</text>
              <text x="276" y="74" fontSize="14" fill="#161413" textAnchor="middle">↗</text>
              <text x="296" y="74" fontSize="14" fill="#161413" textAnchor="middle">⋯</text>

              {/* track 2 */}
              <rect x="12" y="104" width="296" height="48" rx="8" fill="#E9E5DA" />
              <rect x="20" y="112" width="32" height="32" rx="6" fill="#0F5D47" />
              <polygon points="31,121 31,135 42,128" fill="#E9E5DA" />
              <text x="62" y="125" fontSize="9" fontWeight="600" fill="#161413">эпический оркестр</text>
              <text x="62" y="138" fontSize="7.5" fill="#161413" opacity="0.5">ИНСТРУМЕНТАЛ · 2:00 · вчера</text>
              <text x="276" y="130" fontSize="14" fill="#161413" textAnchor="middle">↗</text>
              <text x="296" y="130" fontSize="14" fill="#161413" textAnchor="middle">⋯</text>

              {/* track 3 */}
              <rect x="12" y="160" width="296" height="48" rx="8" fill="#E9E5DA" />
              <rect x="20" y="168" width="32" height="32" rx="6" fill="#161413" />
              <polygon points="31,177 31,191 42,184" fill="#E9E5DA" />
              <text x="62" y="181" fontSize="9" fontWeight="600" fill="#161413">скрип двери</text>
              <text x="62" y="194" fontSize="7.5" fill="#161413" opacity="0.5">SFX · 0:05 · 2 дня назад</text>
              <text x="276" y="186" fontSize="14" fill="#161413" textAnchor="middle">↗</text>
              <text x="296" y="186" fontSize="14" fill="#161413" textAnchor="middle">⋯</text>

              {/* mini player */}
              <rect x="12" y="220" width="296" height="38" rx="8" fill="#161413" />
              <circle cx="36" cy="239" r="12" fill="#E9E5DA" />
              <polygon points="33,233 33,245 44,239" fill="#161413" />
              <text x="58" y="235" fontSize="9" fontWeight="600" fill="#E9E5DA">осенняя мелодия</text>
              <text x="58" y="248" fontSize="7" fill="#8E887F">1:24 / 2:48</text>
              <rect x="240" y="229" width="36" height="18" rx="9" fill="#0F5D47" />
              <text x="258" y="241" fontSize="7" fill="#E9E5DA" textAnchor="middle" fontWeight="600">↓ MP3</text>
              <rect x="281" y="229" width="22" height="18" rx="9" stroke="#E9E5DA" strokeWidth="1" fill="#161413" />
              <text x="292" y="241" fontSize="7" fill="#E9E5DA" textAnchor="middle">WAV</text>
            </svg>
          </div>
        </div>
      </div>

      {/* ─── 08 · Радио ─── */}
      <div className="h-section">
        <div className="tag"><span className="num">08</span> · {isEN ? "radio" : "радио"}</div>
        <h2>{isEN ? "Radio" : "Радио"}</h2>
      </div>
      <div className="guide-article">
        <div className="guide-cols">
          <div className="guide-text">
            <p className="guide-lead-text">
              {isEN
                ? "A curated stream of music published by RIFFA users. Filter by mood, browse the charts, like / dislike tracks, add favourites to your collection. Your own tracks can land here too — one click in the Library."
                : "Подборка музыки, которую пользователи RIFFA выложили в эфир. Фильтруй по настроению, смотри чарты, лайкай / дизлайкай треки, добавляй понравившиеся в свою коллекцию. Твои треки тоже сюда попадут — одним кликом из Библиотеки."}
            </p>

            <div className="guide-steps">
              <div className="guide-step">
                <span className="guide-step-num">1</span>
                <div>
                  <strong>{isEN ? "Open Radio from the sidebar" : "Открой Радио из сайдбара"}</strong>
                  <p>{isEN ? "Sidebar → \"Radio\". The page shows mood cards on top, then the freshest tracks list, then today's chart." : "Сайдбар → «Радио». Сверху — карточки настроений, ниже — лента свежих треков, ещё ниже — чарт за сегодня."}</p>
                </div>
              </div>
              <div className="guide-step">
                <span className="guide-step-num">2</span>
                <div>
                  <strong>{isEN ? "Pick a mood to filter" : "Выбери настроение для фильтра"}</strong>
                  <p>{isEN ? "Click a mood card (Happy, Calm, Sad, Energetic, Dreamy, Aggressive, Inspiring, Anxious, Dramatic, Confident — plus All / Vocal). The track list refreshes to that mood only." : "Кликни карточку настроения (Радостное, Спокойное, Грустное, Энергичное, Мечтательное, Агрессивное, Вдохновляющее, Тревожное, Драматичное, Уверенное — плюс «Все» / «С вокалом»). Лента обновится под выбранное настроение."}</p>
                </div>
              </div>
              <div className="guide-step">
                <span className="guide-step-num">3</span>
                <div>
                  <strong>{isEN ? "Like / dislike to influence the chart" : "Лайкай / дизлайкай — это влияет на чарт"}</strong>
                  <p>{isEN ? "Each row has heart and a listening counter. Likes feed the chart (today / week / month / all-time). Liking also adds the track to \"My collection\" — accessible from the Mood card row." : "У каждой строки — иконки сердца и счетчик прослушиваний. Лайки формируют чарт (сегодня / неделя / месяц / всё время). Лайк ещё добавляет трек в «Мою коллекцию» — её можно открыть из ряда карточек настроения."}</p>
                </div>
              </div>
              <div className="guide-step">
                <span className="guide-step-num">4</span>
                <div>
                  <strong>{isEN ? "Publish your own track" : "Опубликуй свой трек"}</strong>
                  <p>{isEN ? "In the Library, each track variant has a \"Publish to Radio\" toggle. A mood must be set for the track (Radio uses it for filtering). You can publish V1 only, V2 only, or both as separate radio rows." : "В Библиотеке у каждого варианта есть тумблер «На Радио». У трека должно быть настроение (Радио по нему фильтрует). Можно опубликовать только V1, только V2 или оба варианта — будут двумя отдельными карточками."}</p>
                </div>
              </div>
            </div>

            <div className="guide-tips">
              <div className="guide-tips-head">{isEN ? "Tips" : "Советы"}</div>
              <ul>
                <li>{isEN ? "Radio is great for inspiration — leave it on in the background. When something catches your ear, click the track to see its genre and mood, then borrow the style for your own brief." : "Радио отлично для вдохновения — оставь его фоном. Зацепило — кликни на трек, посмотри жанр и настроение, забери стиль в свой бриф (функция в разработке)."}</li>
                <li>{isEN ? "V1 and V2 from the same generation appear as independent rows with their own like / play counters. You can like V1 without affecting V2 — completely independent." : "V1 и V2 из одной генерации — отдельные строки с собственными счётчиками лайков / прослушиваний. Лайк на V1 никак не задевает V2 — они полностью независимы."}</li>
                <li>{isEN ? "Sort the playlist by recent, score (likes minus dislikes), or plays — tabs at the top of the list." : "Сортировка ленты: по свежести, по рейтингу (лайки минус дизлайки), по прослушиваниям — вкладки сверху ленты."}</li>
              </ul>
            </div>
          </div>

          <div className="guide-mockup">
            <svg viewBox="0 0 320 260" xmlns="http://www.w3.org/2000/svg" style={{ fontFamily: "var(--font-mono)" }}>
              <rect width="320" height="260" fill="#F2EFE5" rx="12" />
              {/* now playing large card */}
              <rect x="12" y="12" width="296" height="140" rx="10" fill="#161413" />
              {/* abstract wave art */}
              <defs>
                <radialGradient id="radioGrad" cx="40%" cy="50%" r="70%">
                  <stop offset="0%" stopColor="#0F5D47" stopOpacity="0.6" />
                  <stop offset="100%" stopColor="#161413" stopOpacity="0" />
                </radialGradient>
              </defs>
              <rect x="12" y="12" width="296" height="140" rx="10" fill="url(#radioGrad)" />
              {/* waveform */}
              <g stroke="#E9E5DA" strokeWidth="1.5" strokeLinecap="round" opacity="0.4">
                <line x1="60" y1="70" x2="60" y2="90" />
                <line x1="70" y1="62" x2="70" y2="98" />
                <line x1="80" y1="55" x2="80" y2="105" />
                <line x1="90" y1="62" x2="90" y2="98" />
                <line x1="100" y1="68" x2="100" y2="92" />
                <line x1="110" y1="58" x2="110" y2="102" />
                <line x1="120" y1="52" x2="120" y2="108" />
                <line x1="130" y1="60" x2="130" y2="100" />
                <line x1="140" y1="66" x2="140" y2="94" />
              </g>
              <g stroke="#FF3B1F" strokeWidth="1.5" strokeLinecap="round">
                <line x1="150" y1="64" x2="150" y2="96" />
                <line x1="160" y1="56" x2="160" y2="104" />
                <line x1="170" y1="50" x2="170" y2="110" />
                <line x1="180" y1="58" x2="180" y2="102" />
                <line x1="190" y1="64" x2="190" y2="96" />
              </g>
              <g stroke="#E9E5DA" strokeWidth="1.5" strokeLinecap="round" opacity="0.3">
                <line x1="200" y1="68" x2="200" y2="92" />
                <line x1="210" y1="62" x2="210" y2="98" />
                <line x1="220" y1="55" x2="220" y2="105" />
                <line x1="230" y1="62" x2="230" y2="98" />
                <line x1="240" y1="70" x2="240" y2="90" />
              </g>

              <text x="24" y="134" fontSize="8" fill="#E9E5DA" opacity="0.5">СЕЙЧАС В ЭФИРЕ</text>
              <circle cx="44" cy="110" r="14" fill="#E9E5DA" />
              <polygon points="40,104 40,116 52,110" fill="#161413" />
              <text x="170" y="108" fontSize="11" fontWeight="600" fill="#E9E5DA" textAnchor="middle">ночной город в дождь</text>
              <text x="170" y="122" fontSize="7.5" fill="#8E887F" textAnchor="middle">ИНСТРУМЕНТАЛ · LO-FI · 84 BPM</text>

              {/* progress bar */}
              <rect x="24" y="144" width="272" height="3" rx="1.5" fill="#E9E5DA" opacity="0.2" />
              <rect x="24" y="144" width="130" height="3" rx="1.5" fill="#FF3B1F" />

              {/* track info */}
              <rect x="12" y="162" width="296" height="50" rx="8" fill="#E9E5DA" />
              <text x="24" y="178" fontSize="7.5" fill="#161413" opacity="0.5">ОПИСАНИЕ</text>
              <text x="24" y="192" fontSize="9" fill="#161413">«ночной город в дождь, lo-fi бит,</text>
              <text x="24" y="204" fontSize="9" fill="#161413">атмосферный, 84 BPM, фортепиано»</text>

              {/* action buttons */}
              <rect x="12" y="222" width="136" height="28" rx="14" fill="#0F5D47" />
              <text x="80" y="239" fontSize="8.5" fontWeight="600" fill="#E9E5DA" textAnchor="middle">♡ В БИБЛИОТЕКУ</text>
              <rect x="156" y="222" width="152" height="28" rx="14" stroke="#161413" strokeWidth="1" fill="#F2EFE5" />
              <text x="232" y="239" fontSize="8" fill="#161413" textAnchor="middle">СОЗДАТЬ ПОХОЖИЙ</text>
            </svg>
          </div>
        </div>
      </div>
    </div>
  );
}
