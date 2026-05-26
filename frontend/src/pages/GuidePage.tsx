import { useTranslation } from "react-i18next";
import "./GuidePage.css";

export function GuidePage() {
  const { i18n } = useTranslation();
  const isEN = (i18n.resolvedLanguage || i18n.language || "ru").startsWith("en");

  return (
    <div className="guide-page">
      <div className="top-meta">
        <div className="breadcrumb">
          <b>{isEN ? "guide" : "руководство"}</b>
        </div>
        <div>{isEN ? "8 tools · practical guide" : "8 инструментов · практическое руководство"}</div>
      </div>

      <h1 className="h-page">
        {isEN ? <>How to use <em>RIFFA Studio</em>.</> : <>Как пользоваться <em>RIFFA Studio</em>.</>}
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
                ? "The main tool. RIFFA writes lyrics and produces music together — you get a full track with vocals in about 30 seconds."
                : "Главный инструмент. RIFFA сразу пишет текст и создаёт музыку — получаешь полноценный трек с вокалом примерно за 30 секунд."}
            </p>

            <div className="guide-steps">
              <div className="guide-step">
                <span className="guide-step-num">1</span>
                <div>
                  <strong>{isEN ? "Open the Studio" : "Открой Студию"}</strong>
                  <p>{isEN ? "Go to Studio → make sure the \"Song\" tab is selected (it's the first one, active by default)." : "Перейди в Студию → убедись, что выбрана вкладка «Песня» (первая, активна по умолчанию)."}</p>
                </div>
              </div>
              <div className="guide-step">
                <span className="guide-step-num">2</span>
                <div>
                  <strong>{isEN ? "Describe the idea" : "Опиши идею"}</strong>
                  <p>{isEN ? "In the text field write what you want. For example: \"sad song about autumn, piano, female voice\" or \"energetic hip-hop for a workout\". The more detail, the better the result." : "В текстовое поле напиши, что хочешь. Например: «грустная песня про осень, фортепиано, женский голос» или «энергичный хип-хоп для тренировки». Чем конкретнее описание, тем лучше результат."}</p>
                </div>
              </div>
              <div className="guide-step">
                <span className="guide-step-num">3</span>
                <div>
                  <strong>{isEN ? "Set parameters (optional)" : "Настрой параметры (необязательно)"}</strong>
                  <p>{isEN ? "Below the text field are chips: genre, voice, tempo, duration. Leave them empty — the model will guess from the description. Or set them to narrow the result." : "Под текстовым полем — чипы: жанр, голос, темп, длительность. Оставь пустыми — модель угадает из описания. Или задай, чтобы сузить результат."}</p>
                </div>
              </div>
              <div className="guide-step">
                <span className="guide-step-num">4</span>
                <div>
                  <strong>{isEN ? "Click \"Create Track\"" : "Нажми «Создать трек»"}</strong>
                  <p>{isEN ? "The red button at the bottom right. Costs tokens — the exact price is shown above the button. Generation takes 25–40 seconds." : "Красная кнопка справа снизу. Списывает токены — точная цена видна над кнопкой. Генерация занимает 25–40 секунд."}</p>
                </div>
              </div>
              <div className="guide-step">
                <span className="guide-step-num">5</span>
                <div>
                  <strong>{isEN ? "Listen and download" : "Прослушай и скачай"}</strong>
                  <p>{isEN ? "The finished track appears in the player at the bottom of the screen. Download MP3 for social media or WAV for editing in a DAW." : "Готовый трек появляется в плеере внизу экрана. Скачай MP3 для соцсетей или WAV для монтажа в DAW."}</p>
                </div>
              </div>
            </div>

            <div className="guide-tips">
              <div className="guide-tips-head">{isEN ? "Tips" : "Советы"}</div>
              <ul>
                <li>{isEN ? "Specify the mood and scene: \"a slow song about departure at dawn, city sounds in the background\" works much better than just \"sad song\"." : "Указывай настроение и сцену: «медленная песня о расставании на рассвете, городские звуки на фоне» работает намного лучше, чем просто «грустная песня»."}</li>
                <li>{isEN ? "You can generate multiple variants in parallel — press the button again without waiting for the first to finish." : "Можно генерировать несколько вариантов параллельно — нажми кнопку ещё раз, не дожидаясь окончания первой."}</li>
                <li>{isEN ? "Don't like the result? Tweak the description and regenerate — it's cheap." : "Результат не понравился? Подправь описание и пересоздай — это дёшево."}</li>
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
                  <strong>{isEN ? "Select the \"Instrumental\" tab" : "Выбери вкладку «Инструментал»"}</strong>
                  <p>{isEN ? "In Studio, the second tab after Song. The form becomes simpler — no lyrics settings." : "В Студии — вторая вкладка после Песни. Форма становится проще — без настроек текста."}</p>
                </div>
              </div>
              <div className="guide-step">
                <span className="guide-step-num">2</span>
                <div>
                  <strong>{isEN ? "Describe the mood and style" : "Опиши настроение и стиль"}</strong>
                  <p>{isEN ? "Write: \"epic cinematic orchestral music for a battle scene\" or \"calm jazz for a coffee shop, piano and double bass\". Name instruments, tempo, atmosphere." : "Напиши: «эпическая кинематографическая оркестровая музыка для батальной сцены» или «спокойный джаз для кофейни, фортепиано и контрабас». Называй инструменты, темп, атмосферу."}</p>
                </div>
              </div>
              <div className="guide-step">
                <span className="guide-step-num">3</span>
                <div>
                  <strong>{isEN ? "Set duration" : "Задай длительность"}</strong>
                  <p>{isEN ? "Via the chip below the text field. Options: 0:30, 1:00, 2:00, 3:00. For a video clip — pick exactly the right duration." : "Через чип под текстовым полем. Варианты: 0:30, 1:00, 2:00, 3:00. Под видеоролик — подбери нужную длительность точно."}</p>
                </div>
              </div>
              <div className="guide-step">
                <span className="guide-step-num">4</span>
                <div>
                  <strong>{isEN ? "Generate and check" : "Сгенерируй и проверь"}</strong>
                  <p>{isEN ? "Click \"Create Track\". When done, listen carefully: does the dynamic fit, is the ending smooth? If not — clarify the description and regenerate." : "Нажми «Создать трек». Когда готово, прослушай внимательно: подходит ли динамика, плавно ли завершение? Нет — уточни описание и пересоздай."}</p>
                </div>
              </div>
            </div>

            <div className="guide-tips">
              <div className="guide-tips-head">{isEN ? "Tips" : "Советы"}</div>
              <ul>
                <li>{isEN ? "Specify the purpose: \"for a product video\" or \"for a podcast intro\" helps the model understand what sound is needed." : "Указывай назначение: «для продуктового видео» или «для интро подкаста» помогает модели понять, какой звук нужен."}</li>
                <li>{isEN ? "Write what instruments you want to hear. \"Acoustic guitar and strings, without drums\" is better than \"calm music\"." : "Пиши, какие инструменты хочешь слышать. «Акустическая гитара и струнные, без ударных» лучше, чем «спокойная музыка»."}</li>
                <li>{isEN ? "BPM chip: if you know the tempo of your video edit, set it to match — the music will sync better in editing." : "Чип BPM: если знаешь темп монтажа видео, задай его — музыка лучше ляжет на монтаж."}</li>
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
                ? "Take an existing song and reimagine it in a new style. Make a jazz version of a pop hit, or transfer a classical theme into electronic."
                : "Возьми существующую песню и переосмысли её в новом стиле. Сделай джазовую версию поп-хита или перенеси классическую тему в электронику."}
            </p>

            <div className="guide-steps">
              <div className="guide-step">
                <span className="guide-step-num">1</span>
                <div>
                  <strong>{isEN ? "Select the \"Cover\" tab" : "Выбери вкладку «Кавер»"}</strong>
                  <p>{isEN ? "In Studio, the fourth tab. The form has a dedicated field for the original." : "В Студии — четвёртая вкладка. Форма содержит отдельное поле для оригинала."}</p>
                </div>
              </div>
              <div className="guide-step">
                <span className="guide-step-num">2</span>
                <div>
                  <strong>{isEN ? "Specify the original" : "Укажи оригинал"}</strong>
                  <p>{isEN ? "Enter the name of the song and artist. For example: \"Bohemian Rhapsody — Queen\" or \"Yesterday — The Beatles\". RIFFA will look up the track structure." : "Введи название песни и исполнителя. Например: «Bohemian Rhapsody — Queen» или «Yesterday — The Beatles». RIFFA найдёт структуру трека."}</p>
                </div>
              </div>
              <div className="guide-step">
                <span className="guide-step-num">3</span>
                <div>
                  <strong>{isEN ? "Describe the new style" : "Опиши новый стиль"}</strong>
                  <p>{isEN ? "In the description field explain what you want to transform. \"In the style of lo-fi hip-hop, slowed down, with vinyl crackle\" or \"acoustic version, only guitar and voice\"." : "В поле описания объясни, что хочешь изменить. «В стиле lo-fi hip-hop, замедленная, с потрескиванием винила» или «акустическая версия, только гитара и голос»."}</p>
                </div>
              </div>
              <div className="guide-step">
                <span className="guide-step-num">4</span>
                <div>
                  <strong>{isEN ? "Choose voice (optional)" : "Выбери голос (необязательно)"}</strong>
                  <p>{isEN ? "If the original has a male voice but you want female — select the voice chip. Or leave it as is to preserve the original character." : "Если оригинал с мужским голосом, но хочешь женский — выбери чип голоса. Или оставь как есть, чтобы сохранить оригинальный характер."}</p>
                </div>
              </div>
            </div>

            <div className="guide-tips">
              <div className="guide-tips-head">{isEN ? "Tips" : "Советы"}</div>
              <ul>
                <li>{isEN ? "Stylistic leap works best: pop → jazz, rock → classical, folk → electronic. Slight changes within the same genre are less noticeable." : "Стилевой прыжок работает лучше: поп → джаз, рок → классика, фолк → электроника. Небольшие изменения внутри одного жанра менее заметны."}</li>
                <li>{isEN ? "You can specify a specific instrument combination: \"only violin and piano, no drums, slow tempo\"." : "Можно указать конкретный состав инструментов: «только скрипка и фортепиано, без ударных, медленный темп»."}</li>
                <li>{isEN ? "If you know the key — specify it. \"Transposed to minor\" significantly changes the emotional color." : "Если знаешь тональность — указывай её. «Перенесена в минор» существенно меняет эмоциональную окраску."}</li>
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
                  <strong>{isEN ? "Select the \"SFX\" tab" : "Выбери вкладку «SFX»"}</strong>
                  <p>{isEN ? "The last tab in the Studio. The form is the most minimal — only a description and duration." : "Последняя вкладка в Студии. Форма самая минимальная — только описание и длительность."}</p>
                </div>
              </div>
              <div className="guide-step">
                <span className="guide-step-num">2</span>
                <div>
                  <strong>{isEN ? "Describe the sound precisely" : "Опиши звук точно"}</strong>
                  <p>{isEN ? "The more precise, the more accurate the result. \"Wooden door creaking and closing\" is better than \"door sound\". \"App notification with metallic resonance, 0.5 seconds\" is better than \"notification\"." : "Чем точнее, тем точнее результат. «Скрип деревянной двери и её закрытие» лучше, чем «звук двери». «Уведомление приложения с металлическим резонансом, 0.5 секунды» лучше, чем «уведомление»."}</p>
                </div>
              </div>
              <div className="guide-step">
                <span className="guide-step-num">3</span>
                <div>
                  <strong>{isEN ? "Set duration" : "Задай длительность"}</strong>
                  <p>{isEN ? "For SFX, short durations are available: 0:02, 0:05, 0:10, 0:30. Most UI sounds — 2–5 seconds. Atmospheric ones — up to 30." : "Для SFX доступны короткие длительности: 0:02, 0:05, 0:10, 0:30. Большинство UI-звуков — 2–5 секунд. Атмосферные — до 30."}</p>
                </div>
              </div>
              <div className="guide-step">
                <span className="guide-step-num">4</span>
                <div>
                  <strong>{isEN ? "Generate and check on your project" : "Сгенерируй и проверь на проекте"}</strong>
                  <p>{isEN ? "Download WAV — it preserves lossless quality, which is important for professional audio editors." : "Скачай WAV — он сохраняет потери при сжатии, что важно для профессиональных аудиоредакторов."}</p>
                </div>
              </div>
            </div>

            <div className="guide-tips">
              <div className="guide-tips-head">{isEN ? "Tips" : "Советы"}</div>
              <ul>
                <li>{isEN ? "For game sounds write the context: \"laser shot in a sci-fi game, medium power\" or \"coin pick-up in a 2D platformer\"." : "Для игровых звуков пиши контекст: «выстрел лазером в sci-fi игре, средней мощности» или «подбор монеты в 2D-платформере»."}</li>
                <li>{isEN ? "Describe the texture: \"dry\", \"with echo\", \"muffled\", \"crispy\" — these words precisely shift the result." : "Описывай текстуру: «сухой», «с эхом», «приглушённый», «резкий» — эти слова точно сдвигают результат."}</li>
                <li>{isEN ? "SFX generation is cheaper than a full track — don't be afraid to generate 3–5 variants at once." : "SFX-генерация дешевле полного трека — не бойся создавать 3–5 вариантов сразу."}</li>
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
                  <strong>{isEN ? "Select the \"Cover Art\" tab" : "Выбери вкладку «Обложка»"}</strong>
                  <p>{isEN ? "Third tab in the Studio. The form switches to image generation mode." : "Третья вкладка в Студии. Форма переключается в режим генерации изображения."}</p>
                </div>
              </div>
              <div className="guide-step">
                <span className="guide-step-num">2</span>
                <div>
                  <strong>{isEN ? "Connect to a track (optional)" : "Свяжи с треком (необязательно)"}</strong>
                  <p>{isEN ? "If you already have a track in the Library, you can attach it — RIFFA will analyze the music and suggest visuals that match the mood." : "Если у тебя уже есть трек в Библиотеке, можно прикрепить его — RIFFA проанализирует музыку и предложит визуал под настроение."}</p>
                </div>
              </div>
              <div className="guide-step">
                <span className="guide-step-num">3</span>
                <div>
                  <strong>{isEN ? "Describe the image" : "Опиши образ"}</strong>
                  <p>{isEN ? "What should be on the cover? \"A lonely figure in a field at sunset, golden tones, minimal style\" or \"abstract geometric patterns, neon pink and dark blue, electronic vibes\"." : "Что должно быть на обложке? «Одинокая фигура в поле на закате, золотые тона, минималистичный стиль» или «абстрактные геометрические паттерны, неоново-розовый и тёмно-синий, электронный вайб»."}</p>
                </div>
              </div>
              <div className="guide-step">
                <span className="guide-step-num">4</span>
                <div>
                  <strong>{isEN ? "Choose format and style" : "Выбери формат и стиль"}</strong>
                  <p>{isEN ? "Square 1:1 for streaming (Spotify, Apple Music), rectangle for podcasts. Style chips: photo-realistic, illustration, abstract, 3D." : "Квадрат 1:1 для стриминга (Spotify, Apple Music), прямоугольник для подкастов. Чипы стиля: фотореализм, иллюстрация, абстракция, 3D."}</p>
                </div>
              </div>
              <div className="guide-step">
                <span className="guide-step-num">5</span>
                <div>
                  <strong>{isEN ? "Download in high resolution" : "Скачай в высоком разрешении"}</strong>
                  <p>{isEN ? "The cover comes in 3000×3000 px — ready for uploading to Spotify, iTunes, or printing." : "Обложка выходит в 3000×3000 px — готова для загрузки на Spotify, iTunes или печати."}</p>
                </div>
              </div>
            </div>

            <div className="guide-tips">
              <div className="guide-tips-head">{isEN ? "Tips" : "Советы"}</div>
              <ul>
                <li>{isEN ? "Specify the color palette: \"warm tones, red and orange\" or \"cold monochrome, blue-gray\" — this dramatically narrows the result." : "Указывай цветовую палитру: «тёплые тона, красный и оранжевый» или «холодный монохром, сине-серый» — это кардинально сужает результат."}</li>
                <li>{isEN ? "Specify the reference style: \"in the style of Saul Bass\" or \"like a '70s vinyl cover\" gives the model a clear direction." : "Указывай референсный стиль: «в стиле Сола Басса» или «как обложка винила 70-х» даёт модели чёткое направление."}</li>
                <li>{isEN ? "Generate 2–3 variants at once — each will be unique. Pick the best or combine elements from the description." : "Создавай 2–3 варианта сразу — каждый будет уникальным. Выбери лучший или комбинируй элементы из описания."}</li>
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
                ? "An intelligent assistant that helps when you don't know what to ask for. The agent asks clarifying questions and forms the ideal prompt for you."
                : "Умный помощник, который помогает, когда не знаешь, что запросить. Агент задаёт уточняющие вопросы и формирует за тебя идеальный промт."}
            </p>

            <div className="guide-steps">
              <div className="guide-step">
                <span className="guide-step-num">1</span>
                <div>
                  <strong>{isEN ? "Click \"Ask the Agent\"" : "Нажми «Спросить агента»"}</strong>
                  <p>{isEN ? "The button with a green dot under the text field in the Studio. Opens a chat interface." : "Кнопка с зелёной точкой под текстовым полем в Студии. Открывает интерфейс чата."}</p>
                </div>
              </div>
              <div className="guide-step">
                <span className="guide-step-num">2</span>
                <div>
                  <strong>{isEN ? "Tell the agent what you need in general terms" : "Расскажи агенту в общих чертах"}</strong>
                  <p>{isEN ? "\"I need music for a birthday\", \"I want something sad and electronic\" or \"I don't know, surprise me\" — anything works." : "«Нужна музыка на день рождения», «хочу что-то грустное и электронное» или «не знаю, удиви меня» — подойдёт что угодно."}</p>
                </div>
              </div>
              <div className="guide-step">
                <span className="guide-step-num">3</span>
                <div>
                  <strong>{isEN ? "Answer 2–3 questions" : "Ответь на 2–3 вопроса"}</strong>
                  <p>{isEN ? "The agent will ask clarifying questions: about mood, context, for whom, style. Short answers are enough — \"fast\", \"for myself\", \"I like Radiohead\"." : "Агент задаст уточняющие вопросы: о настроении, контексте, для кого, стиле. Достаточно коротких ответов — «быстрая», «для себя», «нравится Radiohead»."}</p>
                </div>
              </div>
              <div className="guide-step">
                <span className="guide-step-num">4</span>
                <div>
                  <strong>{isEN ? "Review the generated prompt" : "Проверь готовый промт"}</strong>
                  <p>{isEN ? "The agent will compose a detailed description of the track and offer to submit it to the Studio. You can edit it before submitting." : "Агент составит подробное описание трека и предложит отправить его в Студию. Перед отправкой можно отредактировать."}</p>
                </div>
              </div>
              <div className="guide-step">
                <span className="guide-step-num">5</span>
                <div>
                  <strong>{isEN ? "Or just chat with the agent" : "Или просто общайся с агентом"}</strong>
                  <p>{isEN ? "Ask anything about music, request music theory consultation, or ask how best to describe a certain style. The agent is a full-fledged music consultant." : "Спрашивай про музыку, запрашивай консультацию по теории музыки или узнавай, как лучше описать определённый стиль. Агент — полноценный музыкальный консультант."}</p>
                </div>
              </div>
            </div>

            <div className="guide-tips">
              <div className="guide-tips-head">{isEN ? "Tips" : "Советы"}</div>
              <ul>
                <li>{isEN ? "Use the agent when you want something unusual: \"something between jazz and drill\" — it will clarify what exactly you mean and formulate the request correctly." : "Используй агента, когда хочешь что-то необычное: «что-то между джазом и дриллом» — он уточнит, что именно ты имеешь в виду, и правильно сформулирует запрос."}</li>
                <li>{isEN ? "The agent remembers the context of the conversation — you can say \"make it a bit slower and more melancholic\" without repeating the full description." : "Агент помнит контекст разговора — можно говорить «сделай чуть медленнее и меланхоличнее», не повторяя всё описание."}</li>
                <li>{isEN ? "After a session with the agent, the formed prompt remains in the Studio text field — you can use it as a starting point for the next creation." : "После сессии с агентом сформированный промт остаётся в текстовом поле Студии — можно использовать его как отправную точку для следующего создания."}</li>
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
                ? "All your created tracks, covers, and effects are stored here. You can listen, download, share a link, or delete."
                : "Все твои созданные треки, обложки и эффекты хранятся здесь. Можно слушать, скачивать, делиться ссылкой или удалять."}
            </p>

            <div className="guide-steps">
              <div className="guide-step">
                <span className="guide-step-num">1</span>
                <div>
                  <strong>{isEN ? "Open the Library" : "Открой Библиотеку"}</strong>
                  <p>{isEN ? "Left panel → \"Library\" icon (or the keyboard shortcut L). All your creations are here, sorted by date." : "Левая панель → иконка «Библиотека» (или горячая клавиша L). Все твои создания здесь, отсортированы по дате."}</p>
                </div>
              </div>
              <div className="guide-step">
                <span className="guide-step-num">2</span>
                <div>
                  <strong>{isEN ? "Filter by type" : "Фильтруй по типу"}</strong>
                  <p>{isEN ? "Tabs at the top: All · Songs · Instrumentals · SFX · Covers. Use to quickly find the right category." : "Вкладки сверху: Все · Песни · Инструменталы · SFX · Обложки. Используй для быстрого поиска нужной категории."}</p>
                </div>
              </div>
              <div className="guide-step">
                <span className="guide-step-num">3</span>
                <div>
                  <strong>{isEN ? "Listen before downloading" : "Прослушай перед скачиванием"}</strong>
                  <p>{isEN ? "Click on a track — it opens in the player at the bottom. You can listen and then decide which format to download." : "Кликни на трек — он открывается в плеере внизу. Можно прослушать и потом решить, в каком формате скачать."}</p>
                </div>
              </div>
              <div className="guide-step">
                <span className="guide-step-num">4</span>
                <div>
                  <strong>{isEN ? "Share a link" : "Поделись ссылкой"}</strong>
                  <p>{isEN ? "The share icon next to each track generates a public link. The person at the link can listen without logging in and download — if you allow it in the settings." : "Иконка шаринга рядом с каждым треком генерирует публичную ссылку. Человек по ссылке может прослушать без входа и скачать — если ты разрешил в настройках."}</p>
                </div>
              </div>
            </div>

            <div className="guide-tips">
              <div className="guide-tips-head">{isEN ? "Tips" : "Советы"}</div>
              <ul>
                <li>{isEN ? "Titles: by default the track is called by the first words of the description. Rename it by clicking on the title — it makes it easier to find later." : "Названия: по умолчанию трек называется по первым словам описания. Переименуй, кликнув на заголовок — это упрощает поиск позже."}</li>
                <li>{isEN ? "You can use the Library as a streaming service — the player at the bottom keeps playing even as you switch between sections." : "Библиотеку можно использовать как стриминг-сервис — плеер внизу продолжает играть, пока ты переходишь между разделами."}</li>
                <li>{isEN ? "Old generation? Check the Library — perhaps the same track was created earlier and you can just download it again for free." : "Понадобился старый трек? Проверь Библиотеку — возможно, он уже создавался раньше и можно просто скачать его снова без затрат токенов."}</li>
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
                ? "A live stream of music created by RIFFA users right now. A mix of genres and styles — discovery mode for new sounds. Your tracks can also get here."
                : "Живой поток музыки, которую прямо сейчас создают пользователи RIFFA. Микс жанров и стилей — режим открытий для новых звуков. Твои треки тоже могут попасть сюда."}
            </p>

            <div className="guide-steps">
              <div className="guide-step">
                <span className="guide-step-num">1</span>
                <div>
                  <strong>{isEN ? "Open the Radio" : "Открой Радио"}</strong>
                  <p>{isEN ? "Left panel → radio icon. Playback starts immediately. No need to select anything." : "Левая панель → иконка радио. Воспроизведение начинается сразу. Ничего выбирать не нужно."}</p>
                </div>
              </div>
              <div className="guide-step">
                <span className="guide-step-num">2</span>
                <div>
                  <strong>{isEN ? "Listen and discover" : "Слушай и открывай"}</strong>
                  <p>{isEN ? "Each track plays automatically. Like a track — click the heart, and it will be added to your Library. Don't like it — skip to the next." : "Каждый трек играет автоматически. Понравился трек — кликни сердечко, он добавится в твою Библиотеку. Не понравился — пропусти к следующему."}</p>
                </div>
              </div>
              <div className="guide-step">
                <span className="guide-step-num">3</span>
                <div>
                  <strong>{isEN ? "See the details of each track" : "Смотри детали каждого трека"}</strong>
                  <p>{isEN ? "Below the player: creation description, genre, tempo. If you like the sound — you can use this description as a starting point for your own creation in the Studio." : "Под плеером: описание создания, жанр, темп. Если звук понравился — можно использовать это описание как отправную точку для собственного создания в Студии."}</p>
                </div>
              </div>
              <div className="guide-step">
                <span className="guide-step-num">4</span>
                <div>
                  <strong>{isEN ? "Publish your tracks to Radio" : "Публикуй свои треки в Радио"}</strong>
                  <p>{isEN ? "In the Library, each track has a \"Publish to Radio\" option. After publication the track will be heard by all users of the platform." : "В Библиотеке у каждого трека есть опция «Опубликовать в Радио». После публикации трек услышат все пользователи платформы."}</p>
                </div>
              </div>
            </div>

            <div className="guide-tips">
              <div className="guide-tips-head">{isEN ? "Tips" : "Советы"}</div>
              <ul>
                <li>{isEN ? "Radio is great for inspiration: leave it in the background while you work. When something catches your ear — look at the description and borrow the style." : "Радио отлично подходит для вдохновения: оставь его фоном во время работы. Когда что-то зацепит — посмотри описание и заимствуй стиль."}</li>
                <li>{isEN ? "The Radio algorithm prioritizes fresh tracks — your freshly published track will be heard within minutes." : "Алгоритм Радио приоритизирует свежие треки — твой только что опубликованный трек услышат в течение нескольких минут."}</li>
                <li>{isEN ? "Multiple tracks from the same description? Radio will show them together, allowing comparison between different generation variants." : "Несколько треков из одного описания? Радио покажет их рядом, позволяя сравнить разные варианты генерации."}</li>
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
