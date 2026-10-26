# Ассеты GreenMafia

Положите файл сюда с указанным путём — приложение подхватит его само, заглушка исчезнет.
Расширение можно любое из перечисленных: картинки — `webp`, `png`, `jpg`, `svg`; звуки — `mp3`, `ogg`, `m4a`, `wav`.
Полное описание и требования — `GAME_DESIGN.md`, §17.

| Путь (без расширения) | Что | Размер |
|---|---|---|
| `roles/civilian` … `roles/maniac`, `roles/back` | Арт карт 6 ролей и рубашка. Без текста: подпись роли рисует приложение. | 1024×1536 |
| `icons/roles/<роль>` | Одноцветные иконки ролей (SVG, красятся в цвет текста) | 96×96 |
| `stamps/killed`, `stamps/exiled`, `stamps/case-closed` | Штампы «УБИТ», «ИЗГНАН», «ДЕЛО ЗАКРЫТО» (PNG с прозрачностью) | 1024×512 |
| `stamps/alibi`, `stamps/checked-mafia`, `stamps/checked-clean`, `stamps/no-answer` | «АЛИБИ», «МАФИЯ», «НЕ МАФИЯ», «НЕТ ОТВЕТА» | 1024×512 |
| `textures/paper`, `textures/felt`, `textures/cardboard` | Бесшовные фактуры | 1024×1024 |
| `audio/sfx/<имя>` | `night-fall`, `morning`, `stamp`, `chip`, `typewriter`, `tick`, `time-up`, `envelope`, `win-town`, `win-mafia`, `win-maniac` | — |

Иконки приложения (`icon-192.png`, `icon-512.png`, `icon-maskable.png`) лежат отдельно: `app/public/assets/brand/`.
Сейчас там заглушки, созданные скриптом `npm run icons --workspace app`.
