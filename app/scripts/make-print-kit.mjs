import { writeFileSync } from 'node:fs';

// The A4 table kit in every language: public/print-kit.html (Russian) and public/print-kit.en.html (English).
const TEXTS = {
  ru: {
    file: 'print-kit.html',
    seat: 'GREENMAFIA · МЕСТО',
    sheet: (a, b) => `Номера ${a}–${b}`,
    title: 'GreenMafia — комплект для стола',
    nav: '5 листов с номерами + памятка. A4, масштаб 100%, без колонтитулов.<br>Вырежьте карточки по внешним линиям, согните пополам по пунктиру.',
    print: 'Распечатать комплект',
    guide: `<h1>Город засыпает.<br>Игра начинается.</h1><p>Краткая памятка для живой игры в мафию</p><h2>Перед партией</h2><ol><li>Раздайте карточки с номерами — можно случайно. Номер — только метка игрока; в приложении у каждого тот же номер, что на карточке. Речи идут по порядку посадки за столом.</li><li>Ведущий не играет. Роль смотрит только её владелец; после раздачи телефон возвращают ведущему.</li><li>Ведущий объявляет состав ролей, правила первой ночи, раскрытие ролей выбывших, алиби и регламент речей.</li></ol><h2>Ночь</h2><p>Все закрывают глаза. Роли просыпаются по команде ведущего и показывают цель без слов. Обычный порядок: любовница → комиссар → доктор → мафия с доном → дон → маньяк. К кому пришла любовница, тот этой ночью хода не делает. Действуют только роли, предусмотренные партией.</p><p>Не прислушивайтесь к телефону и не подглядывайте. Ведущий выдерживает одинаковые паузы, в том числе для выбывших ролей, если включены фиктивные пробуждения.</p><h2>День</h2><p>Ведущий объявляет итоги ночи. Затем — последние слова, обсуждение по очереди и выставление кандидатов. Говорите в свой ход и соблюдайте таймер. Выбывшие не подсказывают живым.</p><h2>Голосование</h2><p>Показывайте голос по команде ведущего. Порядок при ничьей, возможность воздержаться и действие алиби определяются настройками партии. Итог объявляет ведущий.</p><footer>Эта памятка не заменяет выбранные правила. Точные ограничения ролей доступны в приложении: «Меню ведущего → Правила этой партии».</footer>`,
  },
  en: {
    file: 'print-kit.en.html',
    seat: 'GREENMAFIA · SEAT',
    sheet: (a, b) => `Numbers ${a}–${b}`,
    title: 'GreenMafia — table kit',
    nav: '5 sheets of seat numbers + a host guide. A4, 100% scale, no headers or footers.<br>Cut the cards along the outer lines and fold them in half along the dashes.',
    print: 'Print the kit',
    guide: `<h1>The town falls asleep.<br>The game begins.</h1><p>A short guide for a live game of Mafia</p><h2>Before the game</h2><ol><li>Hand out the number cards — at random is fine. A number is only a player's label; in the app everyone has the same number as on their card. Speeches go in seating order around the table.</li><li>The host does not play. Only the owner looks at a role; after the deal the phone goes back to the host.</li><li>The host announces the roles in play, the first-night rules, whether eliminated roles are revealed, the alibi and the speech rules.</li></ol><h2>Night</h2><p>Everyone closes their eyes. Roles wake up on the host's call and point at their target without words. The usual order: Mistress → Commissar → Doctor → Mafia with the Don → Don → Maniac. Whoever the Mistress visits makes no move that night. Only the roles in this game act.</p><p>Do not listen to the phone and do not peek. The host keeps the same pauses for every role, including eliminated ones when fake wake-ups are on.</p><h2>Day</h2><p>The host announces the results of the night. Then come last words, discussion in turn and nominations. Speak on your turn and respect the timer. Eliminated players do not help the living.</p><h2>Voting</h2><p>Show your vote on the host's call. Tie-breaks, abstaining and the alibi follow the game's settings. The host announces the result.</p><footer>This guide does not replace the chosen rules. The exact role limits are in the app: "Host menu → Rules of this game".</footer>`,
  },
};

const STYLE = `*{box-sizing:border-box}body{margin:0;background:#e9e6dc;color:#182b20;font:16px Georgia,serif}nav{padding:20px;text-align:center}button{padding:12px 24px;font:inherit;cursor:pointer}.page{width:190mm;min-height:270mm;margin:15px auto;background:white;break-after:page;padding:0}.numbers{display:grid;grid-template-columns:repeat(2,95mm);grid-template-rows:repeat(2,130mm)}.tent{height:130mm;border:1px dashed #aaa;break-inside:avoid}.half{height:65mm;text-align:center;display:flex;flex-direction:column;align-items:center;justify-content:center}.half b{font-size:110pt;line-height:1}.half small{font:9pt sans-serif;letter-spacing:2px}.upside{transform:rotate(180deg);border-top:1px dotted #bbb}.guide{padding:14mm;font:12pt/1.5 Georgia,serif}.guide h1{font-size:30pt;line-height:1.05}.guide h2{font-size:17pt;margin-top:8mm}.guide li+li{margin-top:3mm}.guide p{margin-top:4mm}.guide footer{font-size:10pt;margin-top:10mm;border-top:1px solid;padding-top:4mm}.page:last-child{break-after:auto}@page{size:A4 portrait;margin:10mm}@media print{body{background:white;color:black}nav{display:none}.page{margin:0;min-height:270mm}.guide{padding:10mm}}@media screen and (max-width:760px){.page{transform-origin:top left;max-width:100%;overflow:auto}nav{font:14px sans-serif}}`;

for (const [lang, t] of Object.entries(TEXTS)) {
  const pages = Array.from({ length: 5 }, (_, page) => `<section class="page numbers" aria-label="${t.sheet(page * 4 + 1, page * 4 + 4)}">${Array.from({ length: 4 }, (_, i) => {
    const n = page * 4 + i + 1;
    return `<article class="tent"><div class="half upside"><small>${t.seat}</small><b>${n}</b></div><div class="half"><small>${t.seat}</small><b>${n}</b></div></article>`;
  }).join('')}</section>`).join('');
  const html = `<!doctype html><html lang="${lang}"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${t.title}</title><style>
${STYLE}
</style><nav><p>${t.nav}</p><button onclick="window.print()">${t.print}</button></nav>${pages}<section class="page guide">${t.guide}</section></html>`;
  writeFileSync(new URL(`../public/${t.file}`, import.meta.url), html);
}
console.log(`Generated the A4 table kit in ${Object.keys(TEXTS).length} languages: 20 folding seat numbers and a host guide.`);
