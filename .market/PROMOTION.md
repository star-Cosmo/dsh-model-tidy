# 鎺ㄥ箍鏂囨搴擄紙1.2.2 鐗堬級

> 鍙戝竷鍔ㄤ綔锛氭寜绾﹀畾鐢?star 鏈汉鎵ц锛堥櫎鏈細璇濇槑纭巿鏉冨锛屾垜涓嶄唬鍙戯級銆?> 鏈枃浠舵槸鍙洿鎺ュ鍒剁矘璐寸殑鎴愬搧鏂囨锛岄殢鐗堟湰鏇存柊銆?
## 鍙戝竷鍓嶇‘璁わ紙褰撳墠鐘舵€侊級

| 椤圭洰 | 鐘舵€?|
|---|---|
| 甯傚満鏀跺綍 | 鉁?PR #7702 鍚堝苟锛涙弿杩版洿鏂?PR #8410 / #8825 鍧囧凡鍚堝苟 |
| 甯傚満绠€浠嬪叧閿瘝 | 鉁?鍚€屾ā鍨嬫暣鐞嗐€嶃€屾ā鍨嬪垪琛ㄦ暣鐞嗐€嶃€孴idy the model list銆?|
| npm | 鉁?`latest = 1.2.2`锛堝惈 `dsh.compatibility.dsh`銆乣engines.node`锛?|
| GitHub 浠撳簱鎻忚堪 | 鉁?鍚€孌SH 妯″瀷鏁寸悊锛堟ā鍨嬪垪琛ㄦ暣鐞嗭級銆?|
| GitHub topics | 鉁?鍚?`model-tidy`銆乣model-list-tidy`銆乣dsh-plugin` |
| README锛堝洓璇級 | 鉁?鍚笭閬撳娉ㄣ€佽繑鍥為《閮ㄣ€佽仈绯荤珷鑺?|
| 鎴浘 | 鉁?`main.png` + `main01.png`锛宍screenshots.json` 宸插０鏄?|
| DSH STORE | 鈴?Issue #1463 宸叉彁浜ゅ鏍歌姹傦紝绛夊緟鍥炲 |

---

## 涓€銆丩inux.do锛堥閫夛紝鐢ㄦ埛鏈€闆嗕腑锛?
**鏍囬**

```
鍒嗕韩涓€涓?DSH 鎻掍欢锛氭ā鍨嬫暣鐞嗭紙闅愯棌鐢ㄤ笉鍒扮殑妯″瀷 + 缁欐ā鍨嬪拰娓犻亾鏀瑰娉ㄥ悕锛?```

**姝ｆ枃**

```
瑁呬簡鍑犱釜 provider 鎻掍欢涔嬪悗锛屾ā鍨嬭彍鍗曞氨鍙樻垚涓€鍫靛銆?
涓€鏉″厤璐硅溅閬撱€佷竴涓伐浣滃彴 App銆佷袱涓嚜宸遍厤鐨勭綉鍏筹紝杞溂涓夊崄鏉ラ」鈥斺€?澶у鏁版牴鏈笉浼氶€夛紝杩樻湁鍑犱釜鏄悓涓€妯″瀷璧颁簡涓嶅悓娓犻亾鐨勮繎浼奸噸澶嶉」銆?
鎵€浠ュ啓浜嗕釜鎻掍欢鎶婅繖浠朵簨鏀朵竴鏀讹細dsh-model-tidy锛堟ā鍨嬫暣鐞嗭級銆?
瀹冨仛浠€涔?- 閫愭ā鍨嬪紑鍏筹細鍏虫帀鍗充粠閫夋嫨鍣ㄦ秷澶憋紝鎵撳紑鍗冲洖鏉?- 妯″瀷澶囨敞鍚嶏細缁欐ā鍨嬫敼涓嚜宸辫寰楃殑鍚嶅瓧锛屽巶鍟嗙殑璁¤垂鍊嶇巼鍚庣紑鍘熸牱淇濈暀
  锛圙LM-5.3 路 x0.79 鈫?GLM 渚垮疁 路 x0.79锛?- 娓犻亾澶囨敞鍚嶏細缁欐笭閬撴湰韬捣鍚嶏紝閫夋嫨鍣ㄧ殑鍒嗙粍鏍囬灏辨崲鎴愬畠锛宨d 浠ュ皬瀛椾繚鐣?- 鎺掑簭锛氭ā鍨嬪拰娓犻亾閮借兘鐢ㄤ笂涓嬬澶磋皟锛屾樉寮忎繚瀛橈紝閲嶅惎浠嶇敓鏁?- 鎼滅储锛氭寜妯″瀷鍚嶃€佹笭閬撱€佸娉ㄥ悕杩囨护
- 娓犻亾鎵归噺锛氫竴閿殣钘?鏄剧ず鏌愪釜娓犻亾鐨勫叏閮ㄦā鍨?- 杩斿洖椤堕儴锛氶暱鍒楄〃鍙充笅瑙掔殑鍦嗗舰鎸夐挳锛屾粴鍔ㄥ嵆鐜般€佸洖椤跺嵆闅?
瀹冨埢鎰忎笉鍋氱殑浜?- 涓嶉噸鍐欎綘鐨勬笭閬撻厤缃€傞殣钘忓垪琛ㄣ€佸娉ㄨ〃銆佹帓搴忚褰曞彧瀛樺湪鎻掍欢鑷繁鐨勫懡鍚嶇┖闂?- 姝ｅ湪浣跨敤鏌愭ā鍨嬬殑浼氳瘽涓嶅彈褰卞搷锛氳矾鐢辨寜妯″瀷 id 璧帮紝鏀圭殑鍙槸鏄剧ず鍚?- 鍗歌浇鍚庡垪琛ㄥ畬鍏ㄦ仮澶嶅師鏍?- 娓犻亾鏂颁笂鏋剁殑妯″瀷榛樿鍙鈥斺€旀彃浠惰褰曠殑鏄€岃闅愯棌浠€涔堛€嶏紝涓嶆槸銆岃鏄剧ず浠€涔堛€?- 涓嶅仛鍙敤鎬ф娴嬶細鍚勬笭閬撴湁鑷繁鐨勬帓鏌ユ柟寮忥紝涓€涓垪琛ㄥ伐鍏蜂笉璇ヨ姳浣犵殑 token 浠ｅ姵

瑕嗙洊鑼冨洿
寮€鍏充綔鐢ㄤ簬鎵€鏈夋ā鍨嬫潵婧愩€傛彃浠惰繃婊ょ殑鏄?harness 鑷繁鐨勭洰褰曟灇涓?ctx.llm.listModels / ctx.llm.listProviders锛屼篃灏辨槸姣忎釜鐣岄潰閮戒細璇荤殑閭ｄ竴浠藉垪琛ㄣ€?鍏朵粬鎻掍欢閫氳繃 ctx.llm.registerAdapter 娉ㄥ唽鐨勬ā鍨嬨€佷互鍙?llm-pi-ai 涓嬪０鏄庣殑娓犻亾锛?閮借惤鍦ㄨ繖涓€浠藉垪琛ㄩ噷锛屽洜姝ら兘琚鐩栥€?
瀹夎
dsh plugin --profile <浣犵殑 profile> add dsh-model-tidy

鎴栧湪 DSH 鎻掍欢甯傚満鎼溿€屾ā鍨嬫暣鐞嗐€嶃€屾ā鍨嬪垪琛ㄦ暣鐞嗐€嶃€?
浠撳簱锛歨ttps://github.com/star-Cosmo/dsh-model-tidy
npm锛歨ttps://www.npmjs.com/package/dsh-model-tidy

鐣岄潰鍏ㄩ儴鐢?harness 鑷繁鐨?--dsw-* 璁捐浠ょ墝缁樺埗锛屾祬鑹?娣辫壊鑷姩璺熼殢锛?涓嶈仈缃戙€佹棤閬ユ祴銆傛湁鎯虫敼杩涚殑鍔熻兘娆㈣繋鐩存帴鍥炲笘锛屾垨鍙戦偖浠跺埌
chenbin2004sz@163.com銆傝寰楁湁鐢ㄧ殑璇濓紝娆㈣繋鍘讳粨搴撶偣涓?Star銆?```

---

## 浜屻€乂2EX锛堢簿绠€鐗堬級

**鏍囬**

```
鍐欎簡涓?DSH 鎻掍欢锛屾妸妯″瀷閫夋嫨鍣ㄩ噷鐢ㄤ笉鍒扮殑妯″瀷鏀惰捣鏉?```

**姝ｆ枃**锛氱敤 Linux.do 姝ｆ枃锛屽垹鎺夈€岃鐩栬寖鍥淬€嶄竴鑺傦紝淇濈暀銆屽畠鍋氫粈涔?/ 鍒绘剰涓嶅仛 / 瀹夎銆嶃€?
---

## 涓夈€丷eddit r/DeepSeek锛堣嫳鏂囷級

**Title**

```
I built a DSH plugin that keeps the model picker from turning into a wall
```

**Body**

```
Install two or three provider plugins and the model menu becomes unusable.
A free-tier lane, a workbench app, two hand-configured gateways 鈥?suddenly
thirty entries, most of which you will never pick.

So I wrote dsh-model-tidy.

What it does
- One switch per model: off means it disappears from the selector
- Model alias: give a model a name you recognise; the provider's billing
  suffix (GLM-5.3 路 x0.79) survives the rename
- Channel alias: name the provider itself; the picker's group title follows,
  with the id kept beside it
- Arrows: reorder models and channels, saved explicitly, survives restarts
- Search across model, provider and alias
- Per-provider batch show/hide, plus back-to-top for long lists

What it deliberately does not do
- It never rewrites your provider configuration. Hidden list, aliases and
  ordering live in the plugin's own settings namespace
- A model hidden or renamed while a session uses it keeps serving that session
- Uninstalling restores the original list completely
- New models a provider starts advertising are visible by default
- No availability probing 鈥?each channel has its own way to diagnose a
  broken model, and a list tool should not spend your tokens doing it

Install
dsh plugin --profile <your-profile> add dsh-model-tidy

Or search "model list tidy" in the DSH plugin market.

Repo: https://github.com/star-Cosmo/dsh-model-tidy
npm: https://www.npmjs.com/package/dsh-model-tidy

Styled entirely with the harness's own --dsw-* design tokens, follows your
theme, no network access, no telemetry. Feedback welcome 鈥?or email
chenbin2004sz@163.com. Stars appreciated if you find it useful.
```

---

## 鍥涖€佸競鍦?Ideas 璁ㄨ锛堝緛闆嗗姛鑳介渶姹傦級

**鏍囬**

```
璁ㄨ锛氭ā鍨嬪彲鐢ㄦ€ф娴嬶紝澶у闇€瑕佸悧锛?```

**姝ｆ枃**

```
鎴戞槸 dsh-model-tidy锛堟ā鍨嬫暣鐞嗘彃浠讹級鐨勪綔鑰呫€?
1.1.0 閲屽仛杩囦竴涓€屾ā鍨嬪彲鐢ㄦ€ф娴嬨€嶏細鐐逛竴涓嬶紝閫愪釜缁欏綋鍓嶆樉绀虹殑妯″瀷鍙戜竴娆?鏋佸皬鐨勮姹傦紙maxTokens: 1锛夛紝姣忚涓€涓姸鎬佺偣鏍囧嚭鍙敤 / 涓嶅彲鐢?/ 瓒呮椂銆?
鍋氬畠鏄洜涓鸿浜嗕竷鍏釜娓犻亾鍚庯紝缁忓父鎯崇煡閬撹繖浜涙ā鍨嬬幇鍦ㄥ埌搴曞摢浜涜繕娲荤潃鈥斺€?鍏嶈垂杞﹂亾浼氬け鏁堛€佺綉鍏充細杩囨湡銆佷綑棰濅細璺戝厜锛岃€屾ā鍨嬪垪琛ㄦ湰韬笉浼氬憡璇変綘銆?
浣?1.2.0 閲岀Щ闄や簡锛屽師鍥狅細
- 鍚勬笭閬撳叾瀹為兘鏈夎嚜宸辩殑鎺掓煡鏂瑰紡锛堟笭閬撳悗鍙般€佷綑棰濋〉銆佺姸鎬侀〉锛?- 鏁寸悊鎻掍欢閲屽彂鐪熷疄璇锋眰锛屾湁浜鸿寰楄秺鐣岋細鍒楄〃宸ュ叿涓嶈鑺辩敤鎴风殑 token
- 鐜鏉備簡浠ュ悗锛屻€屾娴嬮€氳繃銆嶄篃涓嶅畬鍏ㄧ瓑浜庛€岃兘鐢ㄣ€?
鏈€杩戞湁鐢ㄦ埛鍙嶉甯屾湜瀹冨洖鏉ワ紝鎵€浠ユ兂鍏堝惉鍚剰瑙侊紝鍐嶅喅瀹氳涓嶈浠?鍙€夊姛鑳斤紙榛樿鍏抽棴锛夌殑褰㈠紡鍋氬洖鍘汇€?
濡傛灉鏈?30 绉掞紝娆㈣繋鍥炵瓟锛?1. 浣犱細閬囧埌銆屽垪琛ㄩ噷涓€鍫嗘ā鍨嬶紝涓嶇煡閬撳摢涓繕鑳界敤銆嶇殑闂鍚楋紵
2. 濡傛灉鎻愪緵妫€娴嬶紝浣犲笇鏈涘畠锛?   a. 榛樿寮€鍚紝闅忔墜鍙煡
   b. 榛樿鍏抽棴锛岃缃噷鎵撳紑锛堜笉鎯宠鐨勪汉瀹屽叏鏃犳劅锛?   c. 涓嶉渶瑕侊紝娓犻亾鑷繁鑳芥煡
3. 鑳芥帴鍙楁娴嬫秷鑰楃殑灏戦噺 token 鍚楋紵锛堟瘡涓ā鍨嬩竴娆″崟瀛楀洖澶嶏級

閫?b 鐨勮瘽鎴戜細鍋氭垚锛氶粯璁や笉鍙銆佷笉娉ㄥ唽浠讳綍璺敱锛屽彧鍦ㄨ缃噷鎵嬪姩寮€鍚悗
鎵嶅嚭鐜版寜閽€傚厛鏀堕泦鎰忚锛屽懠澹板鍐嶅姩鎵嬶紝璋㈣阿锛?```

---

## 浜斻€佸彂甯冪邯寰?
- **涓嶉噸澶嶅彂鍚屼竴甯栧埛灞?*锛堜細琚皝锛?- **涓嶅湪鍒汉鎻掍欢鐨?issue 閲屾帹閿€**
- **涓嶅じ澶у姛鑳?*锛堢ぞ鍖轰細鏍稿锛屾崯瀹充俊瑾夛級
- 鍙戝笘鍚?24 灏忔椂鍐呭洖璇勮
- 涓€涓钩鍙颁竴娆″嵆鍙紝闅斿嚑澶╁啀鑰冭檻绗簩涓钩鍙?
## 鍏€佸彲澶嶇敤鐨勮瘉鎹摼鎺?
- 浠撳簱锛歨ttps://github.com/star-Cosmo/dsh-model-tidy
- npm锛歨ttps://www.npmjs.com/package/dsh-model-tidy
- 甯傚満椤碉細https://awesome-dsh-plugin.com/p/star-Cosmo/dsh-model-tidy/
- CI锛歨ttps://github.com/star-Cosmo/dsh-model-tidy/actions
- 鑱旂郴閭锛歝henbin2004sz@163.com
