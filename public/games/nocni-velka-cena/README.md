# Noční Velká cena

3D závod formulí v prohlížeči. Tři kola na nočních okruzích Formule 1 proti pěti soupeřům, startovní světla jako v F1, časy sektorů a garáž s vylepšeními auta.

Celá hra je jeden soubor `index.html`. Stačí ho otevřít v prohlížeči, nic se neinstaluje. 3D grafika se načítá z knihovny [three.js](https://threejs.org/) (r128) přes CDN, takže je potřeba internet.

## Tratě

Na výběr je všech 23 okruhů letošního kalendáře Formule 1 (2026) ve skutečném tvaru a délce. Bahrajn a Saúdská Arábie letos odpadly kvůli válce na Blízkém východě; závod Bahrajnu se jel v malajsijském Sepangu, takže je v seznamu Sepang.

Tvary okruhů pocházejí z GPS dat projektu [bacinger/f1-circuits](https://github.com/bacinger/f1-circuits) (licence MIT). Silnice je ve hře širší než ve skutečnosti a Suzuka má místo mostu křížení.

## Ovládání

| Klávesa | Akce |
|---|---|
| ↑ / W | Plyn |
| ↓ / S | Brzda, couvání |
| ← / → | Zatáčení |
| A / D | Jemné zatáčení |
| C | Přepnout kameru (za autem, nízko, kokpit) |
| R | Nový start |
| M | Zvuk zapnout / vypnout |
| 1 / 2 / 3 | Výběr pneumatik v boxové uličce: měkké / střední / tvrdé |

Na mobilu jsou tlačítka přímo na obrazovce.

## Lobby a režimy

V lobby jsou dvě velké ikony: **Upgrady** (garáž) a **Hrát**. Po kliknutí na Hrát si vybereš režim:

- **Proti botům** – ty a pět soupeřů z počítače.
- **1v1** – online souboj s jedním kamarádem (vytvoř hru a pošli mu kód).
- **1v1v1** – online závod tří hráčů.
- **Turnaj** – série Velkých cen podle kalendáře (3, 6 nebo celá sezóna 23 závodů) proti botům nebo proti jednomu či dvěma kamarádům. Každý závod má skutečný počet kol jako v F1 (Monza 53, Monako 78, Spa 44…) a body se rozdělují jako v F1 (25, 18, 15, 12, 10, 8…). Průběžné pořadí se ukládá, takže můžeš pokračovat později.

V online režimech (1v1 a 1v1v1) mají všichni hráči stejně vylepšené auto: motor, převodovka, brzdy i aerodynamika na stupni 3 z 5. Vylepšení z garáže ani admin kódy tam nic nemění, platí jen v závodě proti botům.

## Pit stop a pneumatiky

Pneumatiky se během jízdy opotřebovávají a ztrácejí přilnavost. Měkké jsou nejrychlejší, ale opotřebí se nejdřív, střední jsou vyvážené a tvrdé vydrží nejdéle. Směs a opotřebení vidíš v palubní desce.

Do boxu zajedeš sám: na cílové rovince u tabule PIT IN zatoč do boxové uličky. Jakmile do ní vjedeš, auto už jede samo: zpomalí na omezovač 180 km/h a projede uličkou ke garáži. Ty jen vybereš pneumatiky (klávesy 1 2 3 nebo klepnutí); když nic nevybereš, dostaneš novou sadu stejné směsi. Auto zajede na značky, z garáže vyběhne 17 mechaniků, zvednou auto zvedáky, vymění všechna čtyři kola a pustí tě boxovou uličkou kolem tabule PIT OUT zpátky na trať. V turnaji se pneumatiky opotřebovávají pomaleji, jako ve skutečném závodě. Zastávku sleduješ kamerou shora.

## Zvuky

Motor hráčova auta zní ze skutečných nahrávek formulí 1 (složka `sounds/`): smyčka vysokých otáček z vozu s motorem V10 a smyčka nízkých otáček z vozu s motorem V8. Hra mezi nimi plynule přechází podle otáček, výšku tónu mění podle rychlosti a zařazeného stupně (pokles při řazení nahoru, meziplyn při podřazení), s plynem zní motor hlasitě a jasně, bez plynu tlumeně. Stejnou nahrávku používají i soupeři, tišeji a s Dopplerovým efektem podle toho, jestli se blíží, nebo vzdalují. Když se nahrávky nenačtou (třeba při otevření souboru přímo z disku), hraje náhradní syntetizovaný motor.

Ostatní zvuky se generují přímo v prohlížeči (Web Audio): pískání turba, prskání z výfuku po ubrání plynu, omezovač v boxové uličce, startovní světla, řazení, náraz do auta i do bariéry, šotolina, pískání pneumatik, sektor, kolo, cíl a kliknutí v menu. Vypínají se klávesou M nebo tlačítkem Zvuk.

Použité nahrávky (obě zkrácené na krátký úsek, převedené na mono, upravené na plynulou smyčku a uložené jako MP3):

- `sounds/f1-v10-vysoke.mp3` z nahrávky „Red Bull-Cosworth RB1 (2005)“ (Mark Webber, Goodwood Festival of Speed 2010), autor Edvvc, licence [CC BY-SA 3.0](https://creativecommons.org/licenses/by-sa/3.0/), zdroj: https://commons.wikimedia.org/wiki/File:Red_Bull-Cosworth_RB1_(2005).ogg (úsek 19,15–19,87 s).
- `sounds/f1-v8-nizke.mp3` z nahrávky „Williams-Cosworth FW32 (2010)“ (Sam Bird, Goodwood Festival of Speed 2010), autor Edvvc, licence [CC BY-SA 3.0](https://creativecommons.org/licenses/by-sa/3.0/), zdroj: https://commons.wikimedia.org/wiki/File:Williams-Cosworth_FW32_(2010).ogg (úsek 5,0–6,2 s).

Upravené zvukové soubory jsou stejně jako originály k dispozici pod licencí CC BY-SA 3.0.

## Garáž

Za každé dokončené kolo dostaneš hned 1 000 kreditů. Za umístění v závodě je další odměna (vítězství 12 000, poslední místo 2 400 při třech kolech) a za nový rekord kola +2 000. Za ně vylepšuješ motor, převodovku, brzdy a aerodynamiku, každé v pěti stupních. Kredity, vylepšení i rekord kola se ukládají v prohlížeči.
